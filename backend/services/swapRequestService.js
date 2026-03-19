const pool = require('../db/pool')
const { releaseExpiredReservations } = require('./seatService')

async function getTicketForSeat(client, seatId) {
  const r = await client.query(
    `SELECT t.id AS ticket_id, t.booking_id, t.passenger_name, t.gender, b.user_id, b.flight_id, b.status AS booking_status
     FROM tickets t
     JOIN bookings b ON b.id = t.booking_id
     WHERE t.seat_id = $1`,
    [seatId]
  )
  return r.rows[0] || null
}

function normalizeGender(value, label) {
  const g = String(value || '').toLowerCase().trim()
  if (g !== 'male' && g !== 'female') {
    throw Object.assign(new Error(`${label} must be "male" or "female".`), { statusCode: 400 })
  }
  return g
}

async function createSwapRequest({
  requesterUserId,
  flightId,
  requesterSeatId,
  targetSeatId,
  requesterGender: requesterGenderBody,
  targetGender: targetGenderBody,
}) {
  if (requesterSeatId === targetSeatId) {
    throw Object.assign(new Error('You cannot swap a seat with itself.'), { statusCode: 400 })
  }

  const requesterGender = normalizeGender(requesterGenderBody, 'requester_gender')
  const targetGender = normalizeGender(targetGenderBody, 'target_gender')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await releaseExpiredReservations(client)

    const seatRows = await client.query(
      `SELECT id, flight_id, seat_number, status FROM seats WHERE id IN ($1, $2) FOR UPDATE`,
      [requesterSeatId, targetSeatId]
    )
    if (seatRows.rowCount !== 2) {
      throw Object.assign(new Error('One or both seats were not found.'), { statusCode: 404 })
    }
    const byId = Object.fromEntries(seatRows.rows.map((s) => [s.id, s]))
    const reqSeat = byId[requesterSeatId]
    const tgtSeat = byId[targetSeatId]
    if (reqSeat.flight_id !== flightId || tgtSeat.flight_id !== flightId) {
      throw Object.assign(new Error('Both seats must belong to the specified flight.'), { statusCode: 400 })
    }
    if (reqSeat.status !== 'booked' || tgtSeat.status !== 'booked') {
      throw Object.assign(new Error('Both seats must be booked to request a swap.'), { statusCode: 400 })
    }

    const reqTicket = await getTicketForSeat(client, requesterSeatId)
    const tgtTicket = await getTicketForSeat(client, targetSeatId)
    if (!reqTicket || !tgtTicket) {
      throw Object.assign(new Error('Could not resolve seat assignments.'), { statusCode: 400 })
    }
    if (reqTicket.booking_status !== 'confirmed' || tgtTicket.booking_status !== 'confirmed') {
      throw Object.assign(new Error('Both bookings must be confirmed.'), { statusCode: 400 })
    }
    if (reqTicket.user_id !== requesterUserId) {
      throw Object.assign(new Error('You can only offer a seat that belongs to your booking.'), { statusCode: 403 })
    }
    if (tgtTicket.user_id === requesterUserId) {
      throw Object.assign(new Error('Cannot request a swap with your own seat.'), { statusCode: 400 })
    }

    if (!reqTicket.gender || !tgtTicket.gender) {
      throw Object.assign(new Error('Seat assignment is missing gender data.'), { statusCode: 400 })
    }
    if (requesterGender !== reqTicket.gender || targetGender !== tgtTicket.gender) {
      throw Object.assign(
        new Error('Gender information does not match current seat assignments. Refresh the seat map and try again.'),
        { statusCode: 400 }
      )
    }

    const ins = await client.query(
      `INSERT INTO seat_swap_requests (
         flight_id, requester_user_id, requester_seat, target_user_id, target_seat,
         requester_gender, target_gender, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, flight_id, requester_user_id, requester_seat, target_user_id, target_seat,
                 requester_gender, target_gender, status, created_at`,
      [
        flightId,
        requesterUserId,
        requesterSeatId,
        tgtTicket.user_id,
        targetSeatId,
        requesterGender,
        targetGender,
      ]
    )

    await client.query('COMMIT')
    return ins.rows[0]
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === '23505') {
      throw Object.assign(
        new Error('A pending swap already involves one of these seats.'),
        { statusCode: 409 }
      )
    }
    throw err
  } finally {
    client.release()
  }
}

async function listPendingForUser(userId) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.flight_id,
       r.requester_user_id,
       r.requester_seat,
       r.target_user_id,
       r.target_seat,
       r.status,
       r.created_at,
       f.flight_number,
       f.airline,
       f.origin,
       f.destination,
       f.departure_time,
       su.name AS requester_name,
       su.email AS requester_email,
       rs.seat_number AS requester_seat_number,
       ts.seat_number AS target_seat_number,
       r.requester_gender,
       r.target_gender
     FROM seat_swap_requests r
     JOIN flights f ON f.id = r.flight_id
     JOIN users su ON su.id = r.requester_user_id
     JOIN seats rs ON rs.id = r.requester_seat
     JOIN seats ts ON ts.id = r.target_seat
     WHERE r.target_user_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [userId]
  )
  return result.rows
}

async function acceptSwapRequest(requestId, userId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await releaseExpiredReservations(client)

    const reqResult = await client.query(
      `SELECT * FROM seat_swap_requests WHERE id = $1 FOR UPDATE`,
      [requestId]
    )
    if (reqResult.rowCount === 0) {
      throw Object.assign(new Error('Swap request not found.'), { statusCode: 404 })
    }
    const req = reqResult.rows[0]
    if (req.status !== 'pending') {
      throw Object.assign(new Error('This swap request is no longer pending.'), { statusCode: 409 })
    }
    if (req.target_user_id !== userId) {
      throw Object.assign(new Error('You can only accept requests addressed to you.'), { statusCode: 403 })
    }

    const seatA = req.requester_seat
    const seatB = req.target_seat

    const seatsCheck = await client.query(
      `SELECT id, flight_id, status FROM seats WHERE id IN ($1, $2) FOR UPDATE`,
      [seatA, seatB]
    )
    if (seatsCheck.rowCount !== 2) {
      throw Object.assign(new Error('Seats no longer exist.'), { statusCode: 400 })
    }
    for (const s of seatsCheck.rows) {
      if (s.flight_id !== req.flight_id || s.status !== 'booked') {
        throw Object.assign(new Error('Seats are no longer available for swap.'), { statusCode: 409 })
      }
    }

    const tA = await getTicketForSeat(client, seatA)
    const tB = await getTicketForSeat(client, seatB)
    if (!tA || !tB) {
      throw Object.assign(new Error('Ticket data missing for swap.'), { statusCode: 400 })
    }
    if (tA.user_id !== req.requester_user_id || tB.user_id !== req.target_user_id) {
      throw Object.assign(new Error('Seat ownership no longer matches this request.'), { statusCode: 409 })
    }
    if (tA.flight_id !== req.flight_id || tB.flight_id !== req.flight_id) {
      throw Object.assign(new Error('Flight mismatch.'), { statusCode: 400 })
    }

    await client.query(`UPDATE tickets SET seat_id = $1 WHERE id = $2`, [seatB, tA.ticket_id])
    await client.query(`UPDATE tickets SET seat_id = $1 WHERE id = $2`, [seatA, tB.ticket_id])

    await client.query(`UPDATE seat_swap_requests SET status = 'accepted' WHERE id = $1`, [requestId])

    await client.query('COMMIT')
    return { ok: true, id: requestId, status: 'accepted' }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function declineSwapRequest(requestId, userId) {
  const result = await pool.query(
    `UPDATE seat_swap_requests
     SET status = 'declined'
     WHERE id = $1 AND target_user_id = $2 AND status = 'pending'
     RETURNING id`,
    [requestId, userId]
  )
  if (result.rowCount === 0) {
    const exists = await pool.query('SELECT id, status, target_user_id FROM seat_swap_requests WHERE id = $1', [requestId])
    if (exists.rowCount === 0) {
      throw Object.assign(new Error('Swap request not found.'), { statusCode: 404 })
    }
    const row = exists.rows[0]
    if (row.target_user_id !== userId) {
      throw Object.assign(new Error('You can only decline requests addressed to you.'), { statusCode: 403 })
    }
    throw Object.assign(new Error('This swap request is no longer pending.'), { statusCode: 409 })
  }
  return { ok: true, id: requestId, status: 'declined' }
}

module.exports = {
  createSwapRequest,
  listPendingForUser,
  acceptSwapRequest,
  declineSwapRequest,
}
