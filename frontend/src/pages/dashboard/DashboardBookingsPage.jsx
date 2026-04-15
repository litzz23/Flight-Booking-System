import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BookingsTable from '../../components/dashboard/BookingsTable'
import DashboardTableControls from '../../components/admin/DashboardTableControls'
import { getUserBookings } from '../../services/userDashboardApi'
import { useDashboardTable } from '../../hooks/useDashboardTable'
import { uniqueDateDayFilter, uniqueValueFilter } from '../../utils/dashboardColumnFilters'

const DASH_BOOKINGS_SORT = {
  flight: (b) => `${b.airline || ''} ${b.flight_number || ''}`.toLowerCase(),
  route: (b) => `${b.origin || ''} ${b.destination || ''}`.toLowerCase(),
  date: (b) => new Date(b.departure_time).getTime(),
  status: (b) => (b.status || '').toLowerCase(),
}

export default function DashboardBookingsPage() {
  const navigate = useNavigate()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const bookingsTableConfig = useMemo(
    () => ({
      getSearchText: (b) =>
        [
          b.airline,
          b.flight_number,
          b.origin,
          b.destination,
          b.status,
          b.departure_time && new Date(b.departure_time).toLocaleString(),
        ]
          .filter(Boolean)
          .join(' '),
      filters: [
        uniqueValueFilter(
          'flightLine',
          'Flight',
          bookings,
          (b) => `${b.airline || ''} · ${b.flight_number || ''}`.trim(),
          { maxOptions: 50 },
        ),
        uniqueValueFilter('origin', 'From', bookings, (b) => b.origin),
        uniqueValueFilter('destination', 'To', bookings, (b) => b.destination),
        uniqueDateDayFilter(
          'depDay',
          'Departure date',
          bookings,
          (b) => new Date(b.departure_time).getTime(),
          { maxOptions: 90 },
        ),
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
      sortAccessors: DASH_BOOKINGS_SORT,
      defaultSort: { key: 'date', dir: 'desc' },
      initialPageSize: 10,
    }),
    [bookings],
  )

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getUserBookings()
      setBookings(data)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load bookings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const table = useDashboardTable(bookings, bookingsTableConfig)

  const goToMyBookingsToCancel = (id) => {
    navigate('/bookings', { state: { highlightBookingId: id } })
  }

  const emptyHint =
    table.totalAll === 0
      ? 'No bookings found.'
      : 'No rows match your search or filters.'

  return (
    <>
      <header className="ud-title-row">
        <h1>My Bookings</h1>
        <p>View and manage your reservations.</p>
      </header>

      {error ? <p className="ud-error">{error}</p> : null}
      {loading ? (
        <p className="ud-empty">Loading bookings...</p>
      ) : (
        <section className="ud-panel">
          <h3>Bookings</h3>
          <DashboardTableControls
            variant="user"
            search={table.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search flight, route, status, date…"
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
          {table.totalFiltered === 0 ? (
            <p className="ud-empty">{emptyHint}</p>
          ) : (
            <BookingsTable
              bookings={table.paginatedRows}
              onCancel={goToMyBookingsToCancel}
              onView={(id) => navigate('/bookings', { state: { highlightBookingId: id } })}
              sortKey={table.sortKey}
              sortDir={table.sortDir}
              onSortColumn={table.toggleSort}
            />
          )}
        </section>
      )}
    </>
  )
}
