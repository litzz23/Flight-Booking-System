const seatService = require('../services/seatService')

function parseSeatIds(value) {
  if (!Array.isArray(value)) return []
  return value.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
}

async function getSeatsByFlight(req, res) {
  try {
    const flightId = Number(req.params.flightId)
    if (!Number.isInteger(flightId) || flightId <= 0) {
      return res.status(400).json({ error: 'Invalid flightId.' })
    }
    const revealAllGenders = req.user?.role === 'admin'
    const viewerUserId = !revealAllGenders && req.user?.role === 'user' ? req.user.id : null
    const seats = await seatService.listSeatsByFlight(flightId, {
      viewerUserId,
      revealAllGenders,
    })
    return res.json(seats)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function lockSeats(req, res) {
  try {
    const seatIds = parseSeatIds(req.body.seatIds)
    if (seatIds.length === 0) {
      return res.status(400).json({ error: 'seatIds[] is required.' })
    }
    const locked = await seatService.lockSeats({ userId: req.user.id, seatIds })
    return res.json({ reserved: locked, expires_in_seconds: 300 })
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}

async function confirmSeats(req, res) {
  try {
    const bookingId = Number(req.params.bookingId)
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ error: 'Invalid bookingId.' })
    }
    const seatIds = parseSeatIds(req.body.seatIds)
    const passengerNames = Array.isArray(req.body.passengerNames) ? req.body.passengerNames.map((p) => String(p)) : null
    const passengerGenders = Array.isArray(req.body.passengerGenders) ? req.body.passengerGenders.map((g) => String(g)) : null
    const passengerShowGenderOnMap = Array.isArray(req.body.passengerShowGenderOnMap)
      ? req.body.passengerShowGenderOnMap
      : null
    const passengerAcceptPeerSwap = Array.isArray(req.body.passengerAcceptPeerSwap)
      ? req.body.passengerAcceptPeerSwap
      : null
    const tickets = await seatService.confirmSeats({
      userId: req.user.id,
      bookingId,
      seatIds,
      passengerNames,
      passengerGenders,
      passengerShowGenderOnMap,
      passengerAcceptPeerSwap,
    })
    return res.json({ tickets })
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}

async function swapSeat(req, res) {
  try {
    const bookingId = Number(req.body.bookingId)
    const fromSeatId = Number(req.body.fromSeatId)
    const toSeatId = Number(req.body.toSeatId)
    if (!Number.isInteger(bookingId) || !Number.isInteger(fromSeatId) || !Number.isInteger(toSeatId)) {
      return res.status(400).json({ error: 'bookingId, fromSeatId and toSeatId are required.' })
    }

    const result = await seatService.swapSeat({
      userId: req.user.id,
      bookingId,
      fromSeatId,
      toSeatId,
    })
    return res.json(result)
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}

module.exports = {
  getSeatsByFlight,
  lockSeats,
  confirmSeats,
  swapSeat,
}
