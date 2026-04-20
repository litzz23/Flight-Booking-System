const swapRequestService = require('../services/swapRequestService')

async function createSwapRequest(req, res) {
  try {
    const { flight_id, requester_seat, target_seat } = req.body
    const flightId = Number(flight_id)
    const requesterSeatId = Number(requester_seat)
    const targetSeatId = Number(target_seat)
    if (!Number.isInteger(flightId) || !Number.isInteger(requesterSeatId) || !Number.isInteger(targetSeatId)) {
      return res.status(400).json({ error: 'flight_id, requester_seat, and target_seat are required.' })
    }
    const row = await swapRequestService.createSwapRequest({
      requesterUserId: req.user.id,
      flightId,
      requesterSeatId,
      targetSeatId,
    })
    return res.status(201).json(row)
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}

async function listSwapRequests(req, res) {
  try {
    const rows = await swapRequestService.listPendingForUser(req.user.id)
    return res.json(rows)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

async function acceptSwapRequest(req, res) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid request id.' })
    }
    const result = await swapRequestService.acceptSwapRequest(id, req.user.id)
    return res.json(result)
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}

async function declineSwapRequest(req, res) {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'Invalid request id.' })
    }
    const result = await swapRequestService.declineSwapRequest(id, req.user.id)
    return res.json(result)
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message })
  }
}

module.exports = {
  createSwapRequest,
  listSwapRequests,
  acceptSwapRequest,
  declineSwapRequest,
}
