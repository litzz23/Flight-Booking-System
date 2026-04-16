import { useMemo } from 'react'
import '../WalletPage.css'
import DashboardTableControls from '../admin/DashboardTableControls'
import { useDashboardTable } from '../../hooks/useDashboardTable'
import { uniqueDateDayFilter, uniqueValueFilter } from '../../utils/dashboardColumnFilters'

function formatTxDate(iso) {
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function txIcon(type) {
  switch (type) {
    case 'top_up':
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2v20M7 7l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'booking_payment':
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" fill="currentColor" />
        </svg>
      )
    case 'refund':
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z" stroke="currentColor" strokeWidth="2" />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg className="w-tx-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
  }
}

const TX_TYPE_LABELS = {
  top_up: 'Top up',
  booking_payment: 'Booking payment',
  refund: 'Refund',
}

const WALLET_SORT = {
  date: (tx) => new Date(tx.created_at).getTime(),
  type: (tx) => (tx.type || '').toLowerCase(),
  description: (tx) => (tx.description || '').toLowerCase(),
}

const WALLET_SORT_FIELDS = [
  { key: 'date', label: 'Date' },
  { key: 'type', label: 'Type' },
  { key: 'description', label: 'Description' },
]

export default function WalletPanel({ balance, transactions, onOpenWallet }) {
  const list = Array.isArray(transactions) ? transactions : []

  const walletTxConfig = useMemo(
    () => ({
      getSearchText: (tx) =>
        [
          tx.description,
          tx.type,
          tx.created_at && new Date(tx.created_at).toLocaleString(),
          tx.amount != null && String(tx.amount),
        ]
          .filter(Boolean)
          .join(' '),
      filters: [
        uniqueValueFilter('type', 'Type', list, (tx) => tx.type),
        uniqueDateDayFilter('day', 'Date', list, (tx) => new Date(tx.created_at).getTime(), {
          maxOptions: 60,
        }),
      ].filter(Boolean),
      sortAccessors: WALLET_SORT,
      defaultSort: { key: 'date', dir: 'desc' },
      initialPageSize: 8,
    }),
    [list],
  )

  const table = useDashboardTable(list, walletTxConfig)

  const onWalletSortField = (key) => {
    table.setSort(key, key === 'type' || key === 'description' ? 'asc' : 'desc')
  }

  return (
    <section className="ud-panel">
      <h3>Wallet</h3>
      <p className="ud-balance">NPR {Number(balance || 0).toLocaleString()}</p>
      <div className="ud-wallet-actions">
        <button type="button" className="ud-btn" onClick={onOpenWallet}>
          Add Funds
        </button>
        <button type="button" className="ud-btn ghost" onClick={onOpenWallet}>
          Transaction History ({list.length})
        </button>
      </div>
      <div className="ud-transactions">
        {list.length === 0 ? (
          <p className="ud-empty">No transactions yet.</p>
        ) : (
          <>
            <DashboardTableControls
              variant="user"
              search={table.search}
              onSearchChange={table.setSearch}
              searchPlaceholder="Search description, type, amount, date…"
              filters={walletTxConfig.filters}
              filterState={table.filterState}
              onFilterChange={table.setFilter}
              sortFields={WALLET_SORT_FIELDS}
              sortKey={table.sortKey}
              sortDir={table.sortDir}
              onSortFieldChange={onWalletSortField}
              onSortDirChange={(dir) => table.setSort(table.sortKey, dir)}
              pageSize={table.pageSize}
              onPageSizeChange={table.setPageSize}
              page={table.page}
              totalPages={table.totalPages}
              onPageChange={table.setPage}
              rangeStart={table.rangeStart}
              rangeEnd={table.rangeEnd}
              totalFiltered={table.totalFiltered}
              pageSizeOptions={[5, 8, 15, 30]}
            />
            {table.totalFiltered === 0 ? (
              <p className="ud-empty">No transactions match your search or filters.</p>
            ) : (
              <ul className="w-tx-list">
                {table.paginatedRows.map((tx) => {
                  const amt = Number(tx.amount)
                  const positive = amt >= 0
                  return (
                    <li key={tx.id} className="w-tx-row">
                      <div className={`w-tx-icon w-tx-icon-${tx.type}`}>{txIcon(tx.type)}</div>
                      <div className="w-tx-body">
                        <p className="w-tx-title">
                          {tx.description ||
                            TX_TYPE_LABELS[tx.type] ||
                            (tx.type || '').replace(/_/g, ' ')}
                        </p>
                        <p className="w-tx-meta">{formatTxDate(tx.created_at)}</p>
                      </div>
                      <div className={`w-tx-amt ${positive ? 'w-tx-pos' : 'w-tx-neg'}`}>
                        {positive ? '+' : ''}NPR {Math.abs(amt).toLocaleString()}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
