/**
 * Passenger cancellation rules (aligned with typical airline-style measures).
 * Refund amounts are informational (no payment gateway in this app).
 */

const MIN_HOURS_BEFORE_DEPARTURE = 2
const TIER_FULL_HOURS = 48
const TIER_PARTIAL_HOURS = 24

function hoursUntil(departureTime) {
  const dep = new Date(departureTime).getTime()
  return (dep - Date.now()) / (1000 * 60 * 60)
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

/**
 * @param {object} params
 * @param {string} params.departure_time
 * @param {string} params.flight_status - scheduled | delayed | cancelled | completed
 * @param {string|number} params.total_price
 * @param {string} params.booking_status - confirmed | cancelled | completed
 * @returns {{ allowed: boolean, reason?: string, code?: string, refund_amount?: number, fee_amount?: number, policy_label?: string, hours_until_departure?: number }}
 */
function getCancellationPreview({ departure_time, flight_status, total_price, booking_status }) {
  const total = roundMoney(total_price)

  if (booking_status === 'cancelled') {
    return { allowed: false, code: 'already_cancelled', reason: 'This booking is already cancelled.' }
  }

  if (booking_status === 'completed') {
    return { allowed: false, code: 'booking_completed', reason: 'This journey is completed; cancellation is not available.' }
  }

  if (flight_status === 'cancelled') {
    return {
      allowed: false,
      code: 'flight_cancelled_by_airline',
      reason:
        'This flight was cancelled by the airline. Please contact support for rebooking or refund options.',
    }
  }

  if (flight_status === 'completed') {
    return { allowed: false, code: 'flight_completed', reason: 'This flight has already operated; cancellation is not available.' }
  }

  const h = hoursUntil(departure_time)

  if (!Number.isFinite(h)) {
    return { allowed: false, code: 'invalid_date', reason: 'Invalid departure time.' }
  }

  if (h <= 0) {
    return { allowed: false, code: 'departed', reason: 'This flight has already departed; online cancellation is closed.' }
  }

  if (h < MIN_HOURS_BEFORE_DEPARTURE) {
    return {
      allowed: false,
      code: 'inside_cutoff',
      reason: `Cancellations must be made at least ${MIN_HOURS_BEFORE_DEPARTURE} hours before departure. Please contact the airline for late changes.`,
      hours_until_departure: roundMoney(h),
    }
  }

  let refundPercent = 50
  let policy_label = '50% refund (50% cancellation fee — 2–24h before departure)'

  if (h >= TIER_FULL_HOURS) {
    refundPercent = 100
    policy_label = 'Full refund (48+ hours before departure)'
  } else if (h >= TIER_PARTIAL_HOURS) {
    refundPercent = 75
    policy_label = '75% refund (25% cancellation fee — 24–48h before departure)'
  }

  const refund_amount = roundMoney((total * refundPercent) / 100)
  const fee_amount = roundMoney(total - refund_amount)

  return {
    allowed: true,
    refund_amount,
    fee_amount,
    policy_label,
    hours_until_departure: roundMoney(h),
    min_hours_notice: MIN_HOURS_BEFORE_DEPARTURE,
  }
}

module.exports = {
  getCancellationPreview,
  MIN_HOURS_BEFORE_DEPARTURE,
}
