import Row from "./Row";
import "./AircraftSeatMap.css";

function parseRowNumber(seatNumber) {
  return Number(String(seatNumber).replace(/[^\d]/g, "")) || 0;
}

function parseColumnLetter(seatNumber) {
  return String(seatNumber).replace(/[\d]/g, "").toUpperCase();
}

function AircraftSeatMap({
  seats,
  selectedSeatIds,
  onToggleSeat,
  mode = "default",
  mySeatIds = [],
  peerSelectedIds = [],
  onPeerSwapSeatClick,
  swapPreviewRequesterSeatId,
  swapPreviewTargetSeatId,
}) {
  const peerSwapMode = mode === "peerSwap";
  const swapPreviewMode = mode === "swapPreview";

  const seatRows = new Map();
  const colSet = new Set();

  for (const seat of seats) {
    const row = parseRowNumber(seat.seat_number);
    const col = parseColumnLetter(seat.seat_number);
    colSet.add(col);
    if (!seatRows.has(row)) seatRows.set(row, {});
    seatRows.get(row)[col] = seat;
  }

  const sortedRows = Array.from(seatRows.keys()).sort((a, b) => a - b);
  const allCols = Array.from(colSet).sort((a, b) => a.localeCompare(b));
  const splitIndex = Math.ceil(allCols.length / 2);
  const leftCols = allCols.slice(0, splitIndex);
  const rightCols = allCols.slice(splitIndex);

  const noopPeer = () => {};

  return (
    <div className="ac-wrap">
      <div className="ac-legend">
        {swapPreviewMode ? (
          <>
            <span>
              <i className="ac-dot ac-dot-male" />
              Male
            </span>
            <span>
              <i className="ac-dot ac-dot-female" />
              Female
            </span>
            <span>
              <i className="ac-dot ac-dot-swap-requester" />
              Their offered seat
            </span>
            <span>
              <i className="ac-dot ac-dot-swap-target" />
              Your seat
            </span>
          </>
        ) : (
          <>
            <span>
              <i className="ac-dot ac-dot-available" />
              Available
            </span>
            <span>
              <i className="ac-dot ac-dot-booked" />
              Booked
            </span>
            <span>
              <i className="ac-dot ac-dot-male" />
              Male
            </span>
            <span>
              <i className="ac-dot ac-dot-female" />
              Female
            </span>
            <span>
              <i className="ac-dot ac-dot-selected" />
              Selected
            </span>
            {peerSwapMode && (
              <>
                <span>
                  <i className="ac-dot ac-dot-mine" />
                  Your seat
                </span>
                <span>
                  <i className="ac-dot ac-dot-no-swap" />
                  No swap requests
                </span>
              </>
            )}
          </>
        )}
      </div>

      <div className="ac-cabin-shell">
        <div className="ac-cockpit-label">Cockpit</div>

        <div className="ac-columns">
          <span className="ac-col-group">
            {leftCols.map((col) => (
              <span key={`left-${col}`}>{col}</span>
            ))}
          </span>
          <span className="ac-aisle-label">Aisle</span>
          <span className="ac-col-group">
            {rightCols.map((col) => (
              <span key={`right-${col}`}>{col}</span>
            ))}
          </span>
        </div>

        <div className="ac-rows">
          {sortedRows.map((rowNumber, idx) => {
            const taperFromTop = Math.max(78, 92 + idx * 0.6);
            return (
              <Row
                key={rowNumber}
                rowNumber={rowNumber}
                leftSeats={leftCols.map(
                  (col) => seatRows.get(rowNumber)[col] || null,
                )}
                rightSeats={rightCols.map(
                  (col) => seatRows.get(rowNumber)[col] || null,
                )}
                selectedSeatIds={selectedSeatIds}
                onToggleSeat={onToggleSeat}
                widthPct={Math.min(98, taperFromTop)}
                peerSwapMode={peerSwapMode}
                swapPreviewMode={swapPreviewMode}
                swapPreviewRequesterSeatId={swapPreviewRequesterSeatId}
                swapPreviewTargetSeatId={swapPreviewTargetSeatId}
                mySeatIds={mySeatIds}
                peerSelectedIds={peerSelectedIds}
                onPeerSwapSeatClick={
                  peerSwapMode ? onPeerSwapSeatClick : noopPeer
                }
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default AircraftSeatMap;
