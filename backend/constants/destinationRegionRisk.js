/** Region-based disruption risk points from `destinations.region`. */

const REGION_BY_KEY = {
  himalayan: {
    points: 40,
    factor: 'Himalayan region — highly weather dependent',
  },
  hilly: {
    points: 15,
    factor: 'Hilly region — variable weather and terrain',
  },
  'mid-hills': {
    points: 15,
    factor: 'Mid-hills — mountain approach / variable conditions',
  },
  terai: {
    points: 10,
    factor: 'Terai sector — distance and network factors',
  },
  'kathmandu valley': {
    points: 0,
    factor: null,
  },
}

/** Normalizes common typos/variants to canonical region keys. */
const REGION_ALIASES = {
  himalaya: 'himalayan',
  himalayas: 'himalayan',
  himalayn: 'himalayan',
  himalyan: 'himalayan',
  himaliya: 'himalayan',
  'mid hills': 'mid-hills',
  midhills: 'mid-hills',
  ktm: 'kathmandu valley',
  kathmandu: 'kathmandu valley',
}

function normalizeRegionKey(raw) {
  let k = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!k) return ''
  if (REGION_ALIASES[k]) k = REGION_ALIASES[k]
  return k
}

function getRegionRiskContribution(regionRaw) {
  const key = normalizeRegionKey(regionRaw)
  if (!key) return { points: 0, factor: null }
  const row = REGION_BY_KEY[key]
  if (!row) return { points: 0, factor: null }
  return { points: row.points, factor: row.factor }
}

function listRegionScoresForApi() {
  return [
    { region: 'Himalayan', points: 40, description: REGION_BY_KEY.himalayan.factor },
    { region: 'Hilly', points: 15, description: REGION_BY_KEY.hilly.factor },
    { region: 'Mid-hills', points: 15, description: REGION_BY_KEY['mid-hills'].factor },
    { region: 'Terai', points: 10, description: REGION_BY_KEY.terai.factor },
    {
      region: 'Kathmandu Valley',
      points: 0,
      description: 'No extra disruption points from region alone',
    },
  ]
}

module.exports = {
  getRegionRiskContribution,
  listRegionScoresForApi,
}
