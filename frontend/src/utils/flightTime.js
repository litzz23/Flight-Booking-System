/** Normalizes API timestamps so duration math is browser-consistent. */
export function parseFlightTime(value) {
  if (value == null || value === '') return null
  const s = String(value).trim()
  const normalized = s.includes('T') ? s : s.replace(' ', 'T')
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

export function getFlightDurationMinutes(dep, arr) {
  const depDate = parseFlightTime(dep)
  const arrDate = parseFlightTime(arr)
  if (!depDate || !arrDate) return 0
  const rawMinutes = Math.round((arrDate - depDate) / 60000)
  if (Number.isFinite(rawMinutes) && rawMinutes > 0) return rawMinutes
  const depClock = depDate.getHours() * 60 + depDate.getMinutes()
  const arrClock = arrDate.getHours() * 60 + arrDate.getMinutes()
  const wrapped = (arrClock - depClock + 1440) % 1440
  return wrapped > 0 ? wrapped : 30
}

export function formatFlightDuration(dep, arr) {
  const mins = getFlightDurationMinutes(dep, arr)
  if (mins <= 0) return '—'
  if (mins >= 60) {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return m ? `${h}h ${m}m` : `${h}h`
  }
  return `${mins} min`
}
