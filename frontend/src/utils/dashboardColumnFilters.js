/** Builds table filter configs from distinct row values. */

const truncateLabel = (s, max = 52) => {
  const t = String(s)
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function uniqueValueFilter(field, label, rows, getValue, options = {}) {
  const { maxOptions = 55, allLabel } = options
  if (!Array.isArray(rows) || rows.length === 0) return null

  const raw = []
  for (const row of rows) {
    const v = getValue(row)
    if (v == null || v === '') continue
    raw.push(String(v).trim())
  }
  const uniques = [...new Set(raw)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )
  if (uniques.length === 0) return null
  if (uniques.length > maxOptions) return null

  return {
    field,
    label,
    allValue: '',
    match: (row, v) => String(getValue(row) ?? '').trim() === v,
    options: [
      { value: '', label: allLabel || `All ${label}` },
      ...uniques.map((u) => ({ value: u, label: truncateLabel(u) })),
    ],
  }
}

export function uniqueDateDayFilter(field, label, rows, getTimestamp, options = {}) {
  const { maxOptions = 90, allLabel } = options
  if (!Array.isArray(rows) || rows.length === 0) return null

  const days = new Set()
  for (const row of rows) {
    const ts = getTimestamp(row)
    if (ts == null || !Number.isFinite(ts)) continue
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) continue
    days.add(d.toISOString().slice(0, 10))
  }
  const uniques = [...days].sort()
  if (uniques.length === 0) return null
  if (uniques.length > maxOptions) return null

  return {
    field,
    label,
    allValue: '',
    match: (row, v) => {
      const ts = getTimestamp(row)
      if (ts == null || !Number.isFinite(ts)) return false
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) return false
      return d.toISOString().slice(0, 10) === v
    },
    options: [
      { value: '', label: allLabel || `All ${label}` },
      ...uniques.map((iso) => ({
        value: iso,
        label: new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      })),
    ],
  }
}
