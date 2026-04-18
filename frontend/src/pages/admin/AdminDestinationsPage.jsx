import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { adminDestinationsApi } from '../../services/adminApi'
import DataTable from '../../components/admin/DataTable'
import DashboardTableControls from '../../components/admin/DashboardTableControls'
import FormModal from '../../components/admin/FormModal'
import { useDashboardTable } from '../../hooks/useDashboardTable'
import { uniqueValueFilter } from '../../utils/dashboardColumnFilters'

const REGION_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'Himalayan', label: 'Himalayan' },
  { value: 'Hilly', label: 'Hilly' },
  { value: 'Terai', label: 'Terai' },
  { value: 'Kathmandu Valley', label: 'Kathmandu Valley' },
  { value: 'Mid-hills', label: 'Mid-hills' },
]

const emptyDestination = {
  city: '',
  region: '',
  image_url: '',
  tagline: '',
}

const getErrorMessage = (err, fallback) =>
  err.response?.data?.error || err.message || fallback

function truncate(value, max = 48) {
  if (!value) return '—'
  return value.length > max ? `${value.slice(0, max)}...` : value
}

export default function AdminDestinationsPage() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyDestination)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setDestinations(await adminDestinationsApi.getAll())
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load destinations.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyDestination)
    setOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      city: row.city || '',
      region: row.region || '',
      image_url: row.image_url || '',
      tagline: row.tagline || '',
    })
    setOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      city: form.city.trim(),
      region: form.region?.trim() || null,
      image_url: form.image_url.trim() || null,
      tagline: form.tagline.trim() || null,
    }
    try {
      if (editing) {
        await adminDestinationsApi.update(editing.id, payload)
        toast.success('Destination updated.')
      } else {
        await adminDestinationsApi.create(payload)
        toast.success('Destination created.')
      }
      setOpen(false)
      await load()
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to save destination.')
      setError(msg)
      toast.error(msg)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this destination?')) {
      return
    }
    try {
      await adminDestinationsApi.delete(id)
      toast.success('Destination deleted.')
      await load()
    } catch (err) {
      const msg = getErrorMessage(err, 'Failed to delete destination.')
      setError(msg)
      toast.error(msg)
    }
  }

  const destTableConfig = useMemo(() => {
    return {
      getSearchText: (r) =>
        [r.city, r.region, r.tagline, r.image_url].filter(Boolean).join(' '),
      filters: [
        uniqueValueFilter('city', 'City', destinations, (d) => d.city),
        uniqueValueFilter(
          'region',
          'Region',
          destinations,
          (d) =>
            d.region && String(d.region).trim()
              ? String(d.region).trim()
              : '(No region)',
        ),
        uniqueValueFilter(
          'tagline',
          'Tagline',
          destinations,
          (d) => (d.tagline && String(d.tagline).trim()) || '(No tagline)',
          { maxOptions: 50 },
        ),
        uniqueValueFilter(
          'image_url',
          'Image URL',
          destinations,
          (d) => (d.image_url && String(d.image_url).trim()) || '(No URL)',
          { maxOptions: 45 },
        ),
      ].filter(Boolean),
      sortAccessors: {
        city: (r) => (r.city || '').toLowerCase(),
        region: (r) => (r.region || '').toLowerCase(),
        image_url: (r) => (r.image_url || '').toLowerCase(),
        tagline: (r) => (r.tagline || '').toLowerCase(),
      },
      defaultSort: { key: 'city', dir: 'asc' },
      initialPageSize: 10,
    }
  }, [destinations])

  const table = useDashboardTable(destinations, destTableConfig)

  const destColumns = useMemo(
    () => [
      { key: 'city', label: 'City', sortable: true },
      {
        key: 'region',
        label: 'Region',
        sortable: true,
        render: (r) => r.region || '—',
      },
      {
        key: 'image_url',
        label: 'Image URL',
        sortable: true,
        render: (r) => truncate(r.image_url),
      },
      {
        key: 'tagline',
        label: 'Tagline',
        sortable: true,
        render: (r) => r.tagline || '—',
      },
    ],
    [],
  )

  const destEmptyMessage =
    table.totalAll === 0
      ? 'No destinations yet.'
      : 'No rows match your search or filters.'

  return (
    <>
      <div className="ad-row-between">
        <header className="ad-title-row">
          <h1>Destination Management</h1>
          <p>Manage destination city metadata for flights.</p>
        </header>
        <button type="button" className="ad-btn primary" onClick={openCreate}>Add Destination</button>
      </div>
      {error ? <p className="ad-error">{error}</p> : null}
      {loading ? (
        <p className="ad-empty">Loading destinations...</p>
      ) : (
        <section className="ad-panel">
          <DashboardTableControls
            variant="admin"
            search={table.search}
            onSearchChange={table.setSearch}
            searchPlaceholder="Search city, region, tagline, URL…"
            filters={destTableConfig.filters}
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
            columns={destColumns}
            rows={table.paginatedRows}
            sortKey={table.sortKey}
            sortDir={table.sortDir}
            onSortColumn={table.toggleSort}
            emptyMessage={destEmptyMessage}
            renderActions={(row) => (
              <>
                <button type="button" className="ad-btn" onClick={() => openEdit(row)}>Edit</button>
                <button type="button" className="ad-btn danger" onClick={() => handleDelete(row.id)}>Delete</button>
              </>
            )}
          />
        </section>
      )}
      <FormModal
        title={editing ? 'Edit Destination' : 'Add Destination'}
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleSubmit}
        submitLabel={editing ? 'Update Destination' : 'Create Destination'}
      >
        <div className="ad-form-grid">
          <div className="ad-field">
            <label>City</label>
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
              required
            />
          </div>
          <div className="ad-field">
            <label htmlFor="dest-region">Region</label>
            <input
              id="dest-region"
              type="text"
              list="admin-destination-regions"
              value={form.region || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
              placeholder="e.g. Himalayan"
              maxLength={100}
            />
            <datalist id="admin-destination-regions">
              {REGION_OPTIONS.filter((o) => o.value).map((o) => (
                <option key={o.value} value={o.value} />
              ))}
            </datalist>
          </div>
          <div className="ad-field">
            <label>Image URL</label>
            <input
              type="text"
              value={form.image_url}
              onChange={(e) => setForm((prev) => ({ ...prev, image_url: e.target.value }))}
            />
          </div>
          <div className="ad-field" style={{ gridColumn: '1 / -1' }}>
            <label>Tagline</label>
            <input
              type="text"
              value={form.tagline}
              onChange={(e) => setForm((prev) => ({ ...prev, tagline: e.target.value }))}
            />
          </div>
        </div>
      </FormModal>
    </>
  )
}
