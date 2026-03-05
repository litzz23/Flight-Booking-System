import Seat from './Seat'

function Row({
  rowNumber,
  leftSeats,
  rightSeats,
  selectedSeatIds,
  onToggleSeat,
  widthPct,
  peerSwapMode,
  swapPreviewMode,
  swapPreviewRequesterSeatId,
  swapPreviewTargetSeatId,
  mySeatIds,
  peerSelectedIds,
  onPeerSwapSeatClick,
}) {
  return (
    <div className="ac-row" style={{ width: `${widthPct}%` }}>
      <span className="ac-row-number">{rowNumber}</span>

      <div className="ac-side">
        {leftSeats.map((seat) => (
          <Seat
            key={seat ? seat.id : `empty-left-${rowNumber}`}
            seat={seat}
            isSelected={seat ? selectedSeatIds.includes(seat.id) : false}
            onToggleSeat={onToggleSeat}
            peerSwapMode={peerSwapMode}
            swapPreviewMode={swapPreviewMode}
            swapPreviewRequesterSeatId={swapPreviewRequesterSeatId}
            swapPreviewTargetSeatId={swapPreviewTargetSeatId}
            mySeatIds={mySeatIds}
            peerSelectedIds={peerSelectedIds}
            onPeerSwapSeatClick={onPeerSwapSeatClick}
          />
        ))}
      </div>

      <div className="ac-aisle" aria-hidden="true" />

      <div className="ac-side">
        {rightSeats.map((seat) => (
          <Seat
            key={seat ? seat.id : `empty-right-${rowNumber}`}
            seat={seat}
            isSelected={seat ? selectedSeatIds.includes(seat.id) : false}
            onToggleSeat={onToggleSeat}
            peerSwapMode={peerSwapMode}
            swapPreviewMode={swapPreviewMode}
            swapPreviewRequesterSeatId={swapPreviewRequesterSeatId}
            swapPreviewTargetSeatId={swapPreviewTargetSeatId}
            mySeatIds={mySeatIds}
            peerSelectedIds={peerSelectedIds}
            onPeerSwapSeatClick={onPeerSwapSeatClick}
          />
        ))}
      </div>
    </div>
  )
}

export default Row
