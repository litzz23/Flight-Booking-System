export default function BookingsTable({
  bookings,
  onCancel,
  onView,
  sortKey,
  sortDir,
  onSortColumn,
}) {
  const sortable = typeof onSortColumn === 'function'

  const headerCell = (colKey, label) => {
    const active = sortable && sortKey === colKey
    return (
      <th
        className={sortable ? 'ud-th-sortable' : undefined}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
      >
        {sortable ? (
          <button type="button" className="ud-th-sort-btn" onClick={() => onSortColumn(colKey)}>
            {label}
            {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ) : (
          label
        )}
      </th>
    )
  }

  if (bookings.length === 0) {
    return <p className="ud-empty">No bookings found.</p>
  }

  return (
    <div className="ud-table-wrap">
      <table className="ud-table">
        <thead>
          <tr>
            {headerCell('flight', 'Flight Name')}
            {headerCell('route', 'From → To')}
            {headerCell('date', 'Date')}
            {headerCell('status', 'Status')}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>
                {b.airline} · {b.flight_number}
              </td>
              <td>
                {b.origin} → {b.destination}
              </td>
              <td>{new Date(b.departure_time).toLocaleString()}</td>
              <td>
                <span className={`ud-status ${b.status}`}>{b.status}</span>
              </td>
              <td className="ud-actions">
                <button type="button" className="ud-btn-lite" onClick={() => onView(b.id)}>
                  View
                </button>
                {b.status !== 'cancelled' ? (
                  <button
                    type="button"
                    className="ud-btn-lite danger"
                    title="Opens My Bookings to review refund policy and confirm"
                    onClick={() => onCancel(b.id)}
                  >
                    Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
