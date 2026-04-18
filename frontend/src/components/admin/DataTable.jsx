export default function DataTable({
  columns,
  rows,
  renderActions,
  sortKey,
  sortDir,
  onSortColumn,
  emptyMessage = 'No data available.',
}) {
  if (!rows?.length) {
    return <p className="ad-empty">{emptyMessage}</p>
  }

  return (
    <div className="ad-table-wrap">
      <table className="ad-table">
        <thead>
          <tr>
            {columns.map((col) => {
              const sortable = Boolean(col.sortable && onSortColumn)
              const active = sortable && sortKey === col.key
              return (
                <th
                  key={col.key}
                  className={sortable ? 'ad-th-sortable' : undefined}
                  aria-sort={
                    active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="ad-th-sort-btn"
                      onClick={() => onSortColumn(col.key)}
                    >
                      {col.label}
                      {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              )
            })}
            {renderActions ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((col) => (
                <td key={`${row.id}-${col.key}`}>{col.render ? col.render(row) : row[col.key]}</td>
              ))}
              {renderActions ? (
                <td>
                  <div className="ad-actions">{renderActions(row)}</div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
