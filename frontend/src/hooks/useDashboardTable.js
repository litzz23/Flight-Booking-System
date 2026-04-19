import { useCallback, useEffect, useMemo, useState } from 'react'

/** Shared client-side table state (search/filter/sort/pagination). */
export function useDashboardTable(rows, config) {
  const {
    getSearchText,
    filters = [],
    sortAccessors = {},
    defaultSort = { key: null, dir: 'asc' },
    initialPageSize = 10,
  } = config || {}

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [sortKey, setSortKey] = useState(defaultSort.key)
  const [sortDir, setSortDir] = useState(defaultSort.dir ?? 'asc')
  const [filterState, setFilterState] = useState(() => {
    const o = {}
    for (const f of filters) {
      o[f.field] = f.allValue ?? ''
    }
    return o
  })

  const filterFieldsKey = useMemo(() => filters.map((f) => f.field).join('|'), [filters])

  useEffect(() => {
    setFilterState((prev) => {
      const next = {}
      for (const f of filters) {
        next[f.field] = Object.prototype.hasOwnProperty.call(prev, f.field)
          ? prev[f.field]
          : f.allValue ?? ''
      }
      return next
    })
  }, [filterFieldsKey])

  const setFilter = (field, value) => {
    setFilterState((prev) => ({ ...prev, [field]: value }))
  }

  const filteredSorted = useMemo(() => {
    let list = Array.isArray(rows) ? [...rows] : []

    const q = search.trim().toLowerCase()
    if (q && typeof getSearchText === 'function') {
      list = list.filter((row) => getSearchText(row).toLowerCase().includes(q))
    }

    for (const f of filters) {
      const val = filterState[f.field]
      if (val !== '' && val != null && typeof f.match === 'function') {
        list = list.filter((row) => f.match(row, val))
      }
    }

    // Sort before slicing so pagination reflects the same global order.
    if (sortKey && sortAccessors[sortKey]) {
      const acc = sortAccessors[sortKey]
      const dir = sortDir
      list.sort((a, b) => {
        const va = acc(a)
        const vb = acc(b)
        let c = 0
        if (va == null && vb == null) c = 0
        else if (va == null) c = 1
        else if (vb == null) c = -1
        else if (typeof va === 'number' && typeof vb === 'number') c = va - vb
        else
          c = String(va).localeCompare(String(vb), undefined, {
            numeric: true,
            sensitivity: 'base',
          })
        if (c === 0) {
          const ida = Number(a?.id)
          const idb = Number(b?.id)
          if (Number.isFinite(ida) && Number.isFinite(idb)) c = ida - idb
        }
        return dir === 'asc' ? c : -c
      })
    }

    return list
  }, [rows, search, filterState, sortKey, sortDir, filters, getSearchText, sortAccessors])

  const totalFiltered = filteredSorted.length
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize) || 1)
  const pageClamped = Math.min(page, totalPages)
  const startIdx = (pageClamped - 1) * pageSize
  const paginatedRows = filteredSorted.slice(startIdx, startIdx + pageSize)

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, filterState, sortKey, sortDir])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  const toggleSort = (key) => {
    if (!sortAccessors[key]) return
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const setSort = useCallback(
    (key, dir) => {
      if (key != null && sortAccessors[key]) setSortKey(key)
      if (dir === 'asc' || dir === 'desc') setSortDir(dir)
    },
    [sortAccessors],
  )

  return {
    search,
    setSearch,
    page: pageClamped,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalFiltered,
    totalAll: rows?.length ?? 0,
    paginatedRows,
    rangeStart: totalFiltered === 0 ? 0 : startIdx + 1,
    rangeEnd: Math.min(startIdx + pageSize, totalFiltered),
    sortKey,
    sortDir,
    toggleSort,
    setSort,
    filterState,
    setFilter,
  }
}
