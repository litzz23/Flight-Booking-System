import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { adminUsersApi } from '../../services/adminApi'
import DataTable from '../../components/admin/DataTable'
import DashboardTableControls from '../../components/admin/DashboardTableControls'
import { useDashboardTable } from '../../hooks/useDashboardTable'
import { uniqueValueFilter } from '../../utils/dashboardColumnFilters'

const USERS_SORT = {
  name: (r) => (r.name || '').toLowerCase(),
  email: (r) => (r.email || '').toLowerCase(),
  role: (r) => (r.role || '').toLowerCase(),
  wallet_balance: (r) => Number(r.wallet_balance || 0),
  account_status: (r) => (r.is_active === false ? 'inactive' : 'active'),
}

const getErrorMessage = (err, fallback) =>
  err.response?.data?.error || err.message || fallback

export default function AdminUsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const usersTableConfig = useMemo(
    () => ({
      getSearchText: (r) =>
        [r.name, r.email, r.role, r.is_active === false ? 'inactive' : 'active']
          .filter(Boolean)
          .join(' '),
      filters: [
        uniqueValueFilter('name', 'Name', users, (r) => r.name),
        uniqueValueFilter('email', 'Email', users, (r) => r.email),
        {
          field: 'role',
          label: 'Role',
          allValue: '',
          match: (row, v) => row.role === v,
          options: [
            { value: '', label: 'All roles' },
            { value: 'user', label: 'User' },
            { value: 'admin', label: 'Admin' },
          ],
        },
        {
          field: 'account_status',
          label: 'Account',
          allValue: '',
          match: (row, v) =>
            (row.is_active === false ? 'inactive' : 'active') === v,
          options: [
            { value: '', label: 'All accounts' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ].filter(Boolean),
      sortAccessors: USERS_SORT,
      defaultSort: { key: 'name', dir: 'asc' },
      initialPageSize: 10,
    }),
    [users],
  )

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await adminUsersApi.getAll())
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load users.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const table = useDashboardTable(users, usersTableConfig)

  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'email', label: 'Email', sortable: true },
      { key: 'role', label: 'Role', sortable: true },
      {
        key: 'wallet_balance',
        label: 'Wallet Balance',
        sortable: true,
        render: (row) => `NPR ${Number(row.wallet_balance || 0).toLocaleString()}`,
      },
      {
        key: 'account_status',
        label: 'Account Status',
        sortable: true,
        render: (row) => (row.is_active === false ? 'Inactive' : 'Active'),
      },
    ],
    [],
  )

  const emptyMessage =
    table.totalAll === 0
      ? 'No users yet.'
      : 'No rows match your search or filters.'

  const toggleUserStatus = async (row) => {
    const nextIsActive = row.is_active === false
    const actionLabel = nextIsActive ? 'activate' : 'deactivate'
    if (
      !window.confirm(
        `Are you sure you want to ${actionLabel} ${row.name || row.email || 'this user'}?`,
      )
    ) {
      return
    }
    try {
      await adminUsersApi.updateStatus(row.id, nextIsActive)
      toast.success(
        nextIsActive ? 'User account activated.' : 'User account deactivated.',
      )
      await load()
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to update account status.')
      setError(msg)
      toast.error(msg)
    }
  }

  return (
    <>
      <header className="ad-title-row">
        <h1>User Management</h1>
        <p>Manage user accounts and roles.</p>
      </header>
      {error ? <p className="ad-error">{error}</p> : null}
      {loading ? (
        <p className="ad-empty">Loading users...</p>
      ) : (
        <section className="ad-panel">
          <DashboardTableControls
            variant="admin"
            search={table.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search name, email, role, status…"
            filters={usersTableConfig.filters}
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
                {row.role !== 'admin' ? (
                  <button
                    type="button"
                    className={`ad-btn ${row.is_active === false ? 'primary' : 'danger'}`}
                    onClick={() => toggleUserStatus(row)}
                  >
                    {row.is_active === false ? 'Activate' : 'Deactivate'}
                  </button>
                ) : null}
              </>
            )}
          />
        </section>
      )}
    </>
  )
}
