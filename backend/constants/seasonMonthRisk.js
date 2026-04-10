const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Nepal month-season risk weights shared by prediction scoring. */
function getSeasonContributionForNepalMonth(month) {
  const factors = []
  let points = 0
  if (month === 6 || month === 7 || month === 8) {
    points += 20
    factors.push('Monsoon season — high disruption risk')
  }
  if (month === 12 || month === 1) {
    points += 15
    factors.push('Winter fog advisory')
  }
  return { points, factors }
}

function listMonthRiskForApi() {
  const months = []
  for (let m = 1; m <= 12; m++) {
    const { points, factors } = getSeasonContributionForNepalMonth(m)
    months.push({
      month: m,
      name: MONTH_NAMES[m - 1],
      short_name: MONTH_NAMES[m - 1].slice(0, 3),
      points,
      factors,
      description:
        factors.length > 0 ? factors.join(' · ') : 'No extra seasonal disruption points',
    })
  }
  return {
    months,
    timezone_note:
      'Uses departure month in Asia/Kathmandu (Nepal), matching disruption scoring.',
  }
}

module.exports = {
  getSeasonContributionForNepalMonth,
  listMonthRiskForApi,
}
