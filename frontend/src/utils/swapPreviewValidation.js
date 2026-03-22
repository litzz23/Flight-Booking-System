function n(v) {
  const x = Number(v)
  return Number.isFinite(x) ? x : NaN
}

function seatById(seats, id) {
  const want = n(id)
  return seats.find((s) => n(s.id) === want)
}

/**
 * Returns null if the swap can still be accepted from the target user's perspective,
 * otherwise a user-facing reason (concurrency / data drift).
 */
export function getSwapPreviewBlockReason(request, seats, currentUserId) {
  if (!request || !Array.isArray(seats) || seats.length === 0) {
    return 'Unable to validate seats. Refresh the map.'
  }
  const uid = n(currentUserId)
  if (!Number.isFinite(uid)) {
    return 'Seat is no longer available for swap.'
  }

  const reqSeat = seatById(seats, request.requester_seat)
  const tgtSeat = seatById(seats, request.target_seat)

  if (!reqSeat || !tgtSeat) {
    return 'Seat is no longer available for swap.'
  }
  if (reqSeat.status !== 'booked' || tgtSeat.status !== 'booked') {
    return 'Seat is no longer available for swap.'
  }

  const ru = reqSeat.user_id != null ? n(reqSeat.user_id) : null
  const tu = tgtSeat.user_id != null ? n(tgtSeat.user_id) : null
  const expReq = n(request.requester_user_id)
  const expTgt = n(request.target_user_id)

  if (ru !== expReq || tu !== expTgt || uid !== expTgt) {
    return 'Seat is no longer available for swap.'
  }

  if (request.requester_gender && reqSeat.gender && request.requester_gender !== reqSeat.gender) {
    return 'Seat is no longer available for swap.'
  }
  if (request.target_gender && tgtSeat.gender && request.target_gender !== tgtSeat.gender) {
    return 'Seat is no longer available for swap.'
  }

  return null
}
