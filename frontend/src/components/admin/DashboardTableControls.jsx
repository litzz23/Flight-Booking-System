function prefixCls(variant) {
  return variant === 'user' ? 'ud' : 'ad'
}

export default function DashboardTableControls({
  variant = 'admin',
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  filterState = {},
  onFilterChange,
  sortFields,
  sortKey,
  sortDir,
  onSortFieldChange,
  onSortDirChange,
  pageSize,
  onPageSizeChange,
  page,
  totalPages,
  onPageChange,
  rangeStart,
  rangeEnd,
  totalFiltered,
  pageSizeOptions = [5, 10, 25, 50],
}) {
  const p = prefixCls(variant)

  return (
    <div className={`${p}-dash-table-controls`}>
      <div className={`${p}-dash-table-toolbar`}>
        <label className={`${p}-dash-search`}>
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
          />
        </label>
        {filters.map((f) => (
          <label key={f.field} className={`${p}-dash-filter`}>
            <span>{f.label}</span>
            <select
              value={filterState[f.field] ?? ''}
              onChange={(e) => onFilterChange(f.field, e.target.value)}
            >
              {f.options.map((opt) => (
                <option key={String(opt.value)} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {!!sortFields?.length && onSortFieldChange && onSortDirChange ? (
          <>
            <label className={`${p}-dash-filter`}>
              <span>Sort by</span>
              <select
                value={sortKey || sortFields[0]?.key || ''}
                onChange={(e) => onSortFieldChange(e.target.value)}
              >
                {sortFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${p}-dash-filter`}>
              <span>Order</span>
              <select
                value={sortDir || 'desc'}
                onChange={(e) => onSortDirChange(e.target.value)}
                disabled={!sortKey}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </label>
          </>
        ) : null}
        <label className={`${p}-dash-page-size`}>
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={`${p}-dash-table-meta`}>
        <span className={`${p}-dash-range`}>
          {totalFiltered === 0
            ? '0 results'
            : `Showing ${rangeStart}–${rangeEnd} of ${totalFiltered}`}
          {totalFiltered > 0 ? (
            <span className={`${p}-dash-sort-global`}> · sorted across all {totalFiltered} matches</span>
          ) : null}
        </span>
        <div className={`${p}-dash-pagination`}>
          <button
            type="button"
            className={`${p}-dash-page-btn`}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>
          <span className={`${p}-dash-page-indicator`}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className={`${p}-dash-page-btn`}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
