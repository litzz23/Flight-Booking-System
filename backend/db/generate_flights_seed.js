/**
 * Generates flights_seed_values.txt with realistic NPR fares that vary by date,
 * day of week, season, and time of day (Nepal domestic approximations).
 *
 * Run: node db/generate_flights_seed.js
 */
const fs = require('fs')
const path = require('path')

const airlines = ['Binayak Air', 'Yeti Airlines', 'Summit Air']

function pad(n) {
  return String(n).padStart(2, '0')
}

function hash32(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0
  return Math.abs(h)
}

/** NPR rounded to nearest 25 (typical fare steps) */
function npr(n) {
  return Math.max(500, Math.round(n / 25) * 25)
}

/**
 * Route bands: typical one-way economy domestic Nepal (NPR), before multipliers.
 * Lukla is high (STOL); Simara short hop lower.
 */
const ROUTE_META = {
  BAPK: {
    dest: 'Pokhara',
    img: 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop',
    tag: 'Phewa Lake & Annapurna',
    durMin: 30,
    seats: 72,
    baseMin: 3600,
    baseMax: 6200,
  },
  BALK: {
    dest: 'Lukla',
    img: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop',
    tag: 'Everest trailhead',
    durMin: 35,
    seats: 18,
    baseMin: 11800,
    baseMax: 16800,
  },
  BABP: {
    dest: 'Bharatpur',
    img: 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop',
    tag: 'Chitwan & safari',
    durMin: 25,
    seats: 72,
    baseMin: 3200,
    baseMax: 5400,
  },
  BABH: {
    dest: 'Bhadrapur',
    img: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop',
    tag: 'Eastern hills',
    durMin: 50,
    seats: 72,
    baseMin: 4800,
    baseMax: 7800,
  },
  BANG: {
    dest: 'Nepalgunj',
    img: 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop',
    tag: 'Western Nepal gateway',
    durMin: 70,
    seats: 72,
    baseMin: 5200,
    baseMax: 8800,
  },
  BASI: {
    dest: 'Simara',
    img: 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop',
    tag: 'Terai corridor',
    durMin: 20,
    seats: 72,
    baseMin: 2400,
    baseMax: 4100,
  },
}

function airlineMultiplier(name) {
  if (name.includes('Yeti')) return 1.04
  if (name.includes('Summit')) return 0.98
  return 1.0
}

/** Vary by calendar date + flight id for distinct prices per row */
function datePriceMultiplier(depIso, flightKey) {
  const t = new Date(depIso.replace(' ', 'T'))
  const y = t.getFullYear()
  const m = t.getMonth() + 1
  const day = t.getDate()
  const dow = t.getDay()

  let mult = 1

  // Weekend / Friday (leisure & outbound peaks)
  if (dow === 0 || dow === 6) mult *= 1.12
  else if (dow === 5) mult *= 1.07

  // Peak trekking / tourist (Mar–May)
  if (m >= 3 && m <= 5) mult *= 1.14
  // Monsoon discount (Jun–Aug)
  if (m >= 6 && m <= 8) mult *= 0.93
  // Festival / autumn travel (Oct–Nov)
  if (m === 10 || m === 11) mult *= 1.09
  // Winter mid (Dec–Feb) slightly softer except holidays
  if (m === 12 || m === 1 || m === 2) mult *= 0.97

  // Per-date noise (different price almost every day)
  const h = hash32(`${y}-${pad(m)}-${pad(day)}-${flightKey}`)
  mult *= 0.94 + (h % 13) / 100 // 0.94–1.06

  return mult
}

function hourMultiplier(depIso) {
  const t = new Date(depIso.replace(' ', 'T'))
  const h = t.getHours()
  if (h >= 6 && h < 9) return 1.06
  if (h >= 11 && h < 14) return 1.04
  if (h >= 17 && h < 20) return 1.05
  if (h < 7) return 1.03
  return 1.0
}

function computeFare(routePrefix, airline, depIso, index) {
  const meta = ROUTE_META[routePrefix]
  const flightKey = `${routePrefix}${pad(index)}`
  const spread = meta.baseMax - meta.baseMin
  const h = hash32(flightKey + airline)
  let base = meta.baseMin + (h % (spread + 1))

  base *= datePriceMultiplier(depIso, flightKey)
  base *= hourMultiplier(depIso)
  base *= airlineMultiplier(airline)

  const price = npr(base)
  // "Typical" published fare ~35–55% above deal (realistic display strikethrough)
  const origMult = 1.38 + (hash32(depIso + flightKey) % 18) / 100
  const original = npr(price * origMult)
  const discount = Math.min(
    52,
    Math.max(15, Math.round((1 - price / original) * 100))
  )
  return { price, original, discount }
}

function addMins(isoDate, hh, mm, addMin) {
  const t = new Date(`${isoDate}T${pad(hh)}:${pad(mm)}:00`)
  t.setMinutes(t.getMinutes() + addMin)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:00`
}

function escSql(s) {
  return s.replace(/'/g, "''")
}

const rows = []

for (const prefix of Object.keys(ROUTE_META)) {
  const meta = ROUTE_META[prefix]
  for (let i = 1; i <= 10; i++) {
    const fn = `${prefix}${pad(i)}`
    const date = new Date(2026, 3, 1 + i)
    const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const hh = 6 + ((i * 2) % 12)
    const mm = (i * 7) % 60
    const dep = `${iso} ${pad(hh)}:${pad(mm)}:00`
    const arr = addMins(iso, hh, mm, meta.durMin)
    const airline = airlines[i % 3]
    const { price, original, discount } = computeFare(prefix, airline, dep, i)
    const avail = Math.floor(meta.seats * (0.42 + (i % 5) * 0.09))
    const tagline = `${meta.tag} · ${airline}`
    rows.push(
      `('${fn}', '${airline}', 'Kathmandu', '${meta.dest}', '${dep}', '${arr}', ${price}, ${original}, ${meta.seats}, ${avail}, '${meta.img}', '${escSql(tagline)}', ${discount})`
    )
  }
}

const returns = [
  {
    prefix: 'PKTK',
    origin: 'Pokhara',
    routeKey: 'BAPK',
    img: 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop',
    tag: 'Return to Kathmandu',
    durMin: 30,
    seats: 72,
    baseMin: 3700,
    baseMax: 6400,
  },
  {
    prefix: 'LKTK',
    origin: 'Lukla',
    routeKey: 'BALK',
    img: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop',
    tag: 'Return from Everest',
    durMin: 35,
    seats: 18,
    baseMin: 11600,
    baseMax: 17200,
  },
]

for (const r of returns) {
  for (let i = 1; i <= 10; i++) {
    const fn = `${r.prefix}${pad(i)}`
    const date = new Date(2026, 3, 15 + i)
    const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    const hh = 7 + ((i * 2) % 11)
    const mm = (i * 11) % 60
    const dep = `${iso} ${pad(hh)}:${pad(mm)}:00`
    const arr = addMins(iso, hh, mm, r.durMin)
    const airline = airlines[(i + 1) % 3]
    const spread = r.baseMax - r.baseMin
    const h0 = hash32(fn + airline)
    let base = r.baseMin + (h0 % (spread + 1))
    base *= datePriceMultiplier(dep, fn)
    base *= hourMultiplier(dep)
    base *= airlineMultiplier(airline)
    const price = npr(base)
    const origMult = 1.36 + (hash32(dep + fn) % 20) / 100
    const original = npr(price * origMult)
    const discount = Math.min(52, Math.max(15, Math.round((1 - price / original) * 100)))
    const avail = Math.floor(r.seats * (0.38 + (i % 5) * 0.1))
    const tagline = `${r.tag} · ${airline}`
    rows.push(
      `('${fn}', '${airline}', '${r.origin}', 'Kathmandu', '${dep}', '${arr}', ${price}, ${original}, ${r.seats}, ${avail}, '${r.img}', '${escSql(tagline)}', ${discount})`
    )
  }
}

const out = rows.join(',\n')
const outPath = path.join(__dirname, 'flights_seed_values.txt')
fs.writeFileSync(outPath, out + '\n', 'utf8')
console.log(`Wrote ${rows.length} rows to ${outPath}`)
