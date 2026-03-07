import './SeatSelection.css'

const COLS = ['A', 'B', 'C', 'D', 'E', 'F']

function SeatSelection({ seats, selectedSeatIds, onToggleSeat }) {
  const rows = new Map()
  for (const seat of seats) {
    const row = Number(String(seat.seat_number).replace(/[^\d]/g, '')) || 0
    if (!rows.has(row)) rows.set(row, {})
    rows.get(row)[seat.seat_number.slice(-1)] = seat
  }

  const sortedRows = Array.from(rows.keys()).sort((a, b) => a - b)

  const getSeatClassName = (seat) => {
    if (!seat) return 'ss-seat ss-seat-empty'
    if (selectedSeatIds.includes(seat.id)) return 'ss-seat ss-seat-selected'
    if (seat.status === 'booked') return 'ss-seat ss-seat-booked'
    if (seat.status === 'reserved') return 'ss-seat ss-seat-reserved'
    return 'ss-seat ss-seat-available'
  }

  return (
    <div className="ss-wrap">
      <div className="ss-legend">
        <span><i className="ss-dot ss-dot-available" />Available</span>
        <span><i className="ss-dot ss-dot-booked" />Booked</span>
        <span><i className="ss-dot ss-dot-selected" />Selected</span>
      </div>
      <div className="ss-plane">
        <div className="ss-plane-nose" />
        <div className="ss-cabin">
          <div className="ss-head">
            <span />
            {COLS.map((c) => <span key={c}>{c}</span>)}
          </div>
          {sortedRows.map((row) => (
            <div className="ss-row" key={row}>
              <span className="ss-row-label">{row}</span>
              {COLS.map((col) => {
                const seat = rows.get(row)?.[col] || null
                const isAisleAfter = col === 'C'
                return (
                  <div
                    key={`${row}${col}`}
                    className={`ss-seat-slot${isAisleAfter ? ' ss-seat-slot-aisle' : ''}`}
                  >
                    <button
                      type="button"
                      className={getSeatClassName(seat)}
                      disabled={!seat || seat.status === 'booked' || seat.status === 'reserved'}
                      onClick={() => seat && onToggleSeat(seat)}
                    >
                      {seat ? seat.seat_number : ''}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="ss-plane-tail" />
      </div>
    </div>
  )
}

export default SeatSelection
