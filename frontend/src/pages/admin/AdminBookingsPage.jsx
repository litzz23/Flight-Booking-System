import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { adminBookingsApi } from '../../services/adminApi'
import DataTable from '../../components/admin/DataTable'
import DashboardTableControls from '../../components/admin/DashboardTableControls'
import { useDashboardTable } from '../../hooks/useDashboardTable'
import { uniqueDateDayFilter, uniqueValueFilter } from '../../utils/dashboardColumnFilters'

const BOOKINGS_SORT = {
  userName: (r) => (r.userName || '').toLowerCase(),
  flightName: (r) => (r.flightName || '').toLowerCase(),
  date: (r) => new Date(r.date).getTime(),
  status: (r) => (r.status || '').toLowerCase(),
}

const getErrorMessage = (err, fallback) =>
  err.response?.data?.error || err.message || fallback

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const bookingsTableConfig = useMemo(
    () => ({
      getSearchText: (r) =>
        [r.userName, r.flightName, r.status, r.date && new Date(r.date).toLocaleString()]
          .filter(Boolean)
          .join(' '),
      filters: [
        uniqueValueFilter('userName', 'User', bookings, (r) => r.userName),
        uniqueValueFilter('flightName', 'Flight', bookings, (r) => r.flightName),
        uniqueDateDayFilter('dateDay', 'Date', bookings, (r) => new Date(r.date).getTime()),
        {
          field: 'status',
          label: 'Status',
          allValue: '',
          match: (row, v) => String(row.status || '').toLowerCase() === String(v).toLowerCase(),
          options: [
            { value: '', label: 'All statuses' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'completed', label: 'Completed' },
            { value: 'pending', label: 'Pending' },
          ],
        },
      ].filter(Boolean),
      sortAccessors: BOOKINGS_SORT,
      defaultSort: { key: 'date', dir: 'desc' },
      initialPageSize: 10,
    }),
    [bookings],
  )

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setBookings(await adminBookingsApi.getAll())
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load bookings.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const table = useDashboardTable(bookings, bookingsTableConfig)

  const columns = useMemo(
    () => [
      { key: 'userName', label: 'User Name', sortable: true },
      { key: 'flightName', label: 'Flight Name', sortable: true },
      {
        key: 'date',
        label: 'Date',
        sortable: true,
        render: (r) => new Date(r.date).toLocaleString(),
      },
      { key: 'status', label: 'Status', sortable: true },
    ],
    [],
  )

  const emptyMessage =
    table.totalAll === 0
      ? 'No bookings yet.'
      : 'No rows match your search or filters.'

  const updateStatus = async (id, status) => {
    if (
      status === 'cancelled' &&
      !window.confirm('Are you sure you want to cancel this booking?')
    ) {
      return
    }
    try {
      await adminBookingsApi.updateStatus(id, status)
      toast.success(`Booking ${status}.`)
      await load()
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to update booking.')
      setError(msg)
      toast.error(msg)
    }
  }

  return (
    <>
      <header className="ad-title-row">
        <h1>Booking Management</h1>
        <p>Review and control booking statuses.</p>
      </header>
      {error ? <p className="ad-error">{error}</p> : null}
      {loading ? (
        <p className="ad-empty">Loading bookings...</p>
      ) : (
        <section className="ad-panel">
          <DashboardTableControls
            variant="admin"
            search={table.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search user, flight, status, date…"
            filters={bookingsTableConfig.filters}
            filterState={table.filterState}
            onFilterChange={table.setFilter}
            pageSize={table.pageSize}
            onPageSizeChange={table.setPageSize}
            page={table.page}
            totalPages={table.totalPages}
            onPageChange={table.setPage}
            rangeStart={table.rangeStart}
            rangeEnd={table.rangeEnd}
            totalFiltered={table.totalFiltered}
          />
          <DataTable
            columns={columns}
            rows={table.paginatedRows}
            sortKey={table.sortKey}
            sortDir={table.sortDir}
            onSortColumn={table.toggleSort}
            emptyMessage={emptyMessage}
            renderActions={(row) => (
              <>
                <button type="button" className="ad-btn primary" onClick={() => updateStatus(row.id, 'confirmed')}>
                  Confirm
                </button>
                <button type="button" className="ad-btn danger" onClick={() => updateStatus(row.id, 'cancelled')}>
                  Cancel
                </button>
              </>
            )}
          />
        </section>
      )}
    </>
  )
}
