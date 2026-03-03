const pool = require('../db/pool')
const { getSeatsByFlight } = require('../models/seatModel')

const RESERVATION_MINUTES = 5

async function releaseExpiredReservations(clientOrPool = pool) {
  const result = await clientOrPool.query(
    `UPDATE seats
     SET status = 'available',
         reserved_until = NULL,
         reserved_by_user_id = NULL
     WHERE status = 'reserved'
       AND reserved_until IS NOT NULL
       AND reserved_until <= NOW()
     RETURNING id`
  )
  return result.rowCount
}

function mapSeatRow(row) {
  const booked = row.status === 'booked'
  const userId = booked && row.booked_user_id != null ? row.booked_user_id : null
  const gender = booked && (row.booked_gender === 'male' || row.booked_gender === 'female')
    ? row.booked_gender
    : null
  return {
    id: row.id,
    flight_id: row.flight_id,
    seat_number: row.seat_number,
    class: row.class,
    status: row.status,
    reserved_until: row.reserved_until,
    is_booked: booked,
    user_id: userId,
    gender,
    seatNumber: row.seat_number,
    isBooked: booked,
    userId: userId != null ? String(userId) : null,
  }
}

async function listSeatsByFlight(flightId) {
  await releaseExpiredReservations()
  const client = await pool.connect()
  try {
    const rows = await getSeatsByFlight(client, flightId)
    return rows.map(mapSeatRow)
  } finally {
    client.release()
  }
}

async function lockSeats({ userId, seatIds }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await releaseExpiredReservations(client)

    const seatRows = await client.query(
      `SELECT id, flight_id, seat_number, status, reserved_until, reserved_by_user_id
       FROM seats
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [seatIds]
    )

    if (seatRows.rowCount !== seatIds.length) {
      throw Object.assign(new Error('One or more selected seats were not found.'), { statusCode: 404 })
    }

    for (const seat of seatRows.rows) {
      if (seat.status === 'booked') {
        throw Object.assign(new Error(`Seat ${seat.seat_number} is already booked.`), { statusCode: 409 })
      }
      if (seat.status === 'reserved' && seat.reserved_by_user_id !== userId) {
        throw Object.assign(new Error(`Seat ${seat.seat_number} is reserved by another user.`), { statusCode: 409 })
      }
    }

    const flights = new Set(seatRows.rows.map((s) => s.flight_id))
    if (flights.size > 1) {
      throw Object.assign(new Error('All selected seats must belong to the same flight.'), { statusCode: 400 })
    }

    const lockResult = await client.query(
      `UPDATE seats
       SET status = 'reserved',
           reserved_until = NOW() + INTERVAL '${RESERVATION_MINUTES} minutes',
           reserved_by_user_id = $2
       WHERE id = ANY($1::int[])
       RETURNING id, seat_number, flight_id, class, status, reserved_until`,
      [seatIds, userId]
    )

    await client.query('COMMIT')
    return lockResult.rows
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

function parseGenders(passengerGenders, count) {
  if (!Array.isArray(passengerGenders) || passengerGenders.length !== count) {
    return null
  }
  const out = passengerGenders.map((g) => String(g).toLowerCase().trim())
  for (const g of out) {
    if (g !== 'male' && g !== 'female') return null
  }
  return out
}

async function confirmSeats({ userId, bookingId, seatIds, passengerNames, passengerGenders }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await releaseExpiredReservations(client)

    const bookingResult = await client.query(
      `SELECT id, user_id, flight_id, passengers
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId]
    )
    if (bookingResult.rowCount === 0) {
      throw Object.assign(new Error('Booking not found.'), { statusCode: 404 })
    }
    const booking = bookingResult.rows[0]
    if (booking.user_id !== userId) {
      throw Object.assign(new Error('You can only confirm seats for your own booking.'), { statusCode: 403 })
    }

    if (!Array.isArray(seatIds) || seatIds.length !== booking.passengers) {
      throw Object.assign(new Error(`You must confirm exactly ${booking.passengers} seat(s).`), { statusCode: 400 })
    }

    const seatRows = await client.query(
      `SELECT id, flight_id, seat_number, status, reserved_by_user_id
       FROM seats
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [seatIds]
    )
    if (seatRows.rowCount !== seatIds.length) {
      throw Object.assign(new Error('One or more selected seats were not found.'), { statusCode: 404 })
    }
    for (const seat of seatRows.rows) {
      if (seat.flight_id !== booking.flight_id) {
        throw Object.assign(new Error(`Seat ${seat.seat_number} does not belong to this booking's flight.`), { statusCode: 400 })
      }
      if (seat.status !== 'reserved' || seat.reserved_by_user_id !== userId) {
        throw Object.assign(new Error(`Seat ${seat.seat_number} is not reserved by you.`), { statusCode: 409 })
      }
    }

    const passengerList = Array.isArray(passengerNames) && passengerNames.length === booking.passengers
      ? passengerNames
      : Array.from({ length: booking.passengers }, (_, i) => `Passenger ${i + 1}`)

    const genders = parseGenders(passengerGenders, booking.passengers)
    if (!genders) {
      throw Object.assign(
        new Error(`Provide passengerGenders with exactly ${booking.passengers} value(s), each "male" or "female".`),
        { statusCode: 400 }
      )
    }

    await client.query(
      `UPDATE seats
       SET status = 'booked',
           reserved_until = NULL,
           reserved_by_user_id = NULL
       WHERE id = ANY($1::int[])`,
      [seatIds]
    )

    await client.query('DELETE FROM tickets WHERE booking_id = $1', [bookingId])
    for (let i = 0; i < seatIds.length; i++) {
      await client.query(
        `INSERT INTO tickets (booking_id, seat_id, passenger_name, gender)
         VALUES ($1, $2, $3, $4)`,
        [bookingId, seatIds[i], passengerList[i] || `Passenger ${i + 1}`, genders[i]]
      )
    }

    const result = await client.query(
      `SELECT t.id, t.booking_id, t.seat_id, t.passenger_name, t.gender, s.seat_number
       FROM tickets t
       JOIN seats s ON s.id = t.seat_id
       WHERE t.booking_id = $1
       ORDER BY t.id`,
      [bookingId]
    )

    await client.query('COMMIT')
    return result.rows
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

async function swapSeat({ userId, bookingId, fromSeatId, toSeatId }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await releaseExpiredReservations(client)

    const bookingResult = await client.query(
      'SELECT id, user_id, flight_id FROM bookings WHERE id = $1 FOR UPDATE',
      [bookingId]
    )
    if (bookingResult.rowCount === 0) {
      throw Object.assign(new Error('Booking not found.'), { statusCode: 404 })
    }
    const booking = bookingResult.rows[0]
    if (booking.user_id !== userId) {
      throw Object.assign(new Error('You can only swap seats for your own booking.'), { statusCode: 403 })
    }

    const ticketResult = await client.query(
      'SELECT id FROM tickets WHERE booking_id = $1 AND seat_id = $2 FOR UPDATE',
      [bookingId, fromSeatId]
    )
    if (ticketResult.rowCount === 0) {
      throw Object.assign(new Error('Current seat is not assigned to this booking.'), { statusCode: 400 })
    }
    const ticketId = ticketResult.rows[0].id

    const fromSeatResult = await client.query(
      'SELECT id, flight_id, seat_number FROM seats WHERE id = $1 FOR UPDATE',
      [fromSeatId]
    )
    const toSeatResult = await client.query(
      'SELECT id, flight_id, seat_number, status FROM seats WHERE id = $1 FOR UPDATE',
      [toSeatId]
    )
    if (fromSeatResult.rowCount === 0 || toSeatResult.rowCount === 0) {
      throw Object.assign(new Error('Seat not found.'), { statusCode: 404 })
    }

    const fromSeat = fromSeatResult.rows[0]
    const toSeat = toSeatResult.rows[0]
    if (fromSeat.flight_id !== booking.flight_id || toSeat.flight_id !== booking.flight_id) {
      throw Object.assign(new Error('Seat swap is only allowed within the same flight.'), { statusCode: 400 })
    }
    if (toSeat.status !== 'available') {
      throw Object.assign(new Error(`Seat ${toSeat.seat_number} is not available.`), { statusCode: 409 })
    }

    await client.query(
      `UPDATE seats SET status = 'available', reserved_until = NULL, reserved_by_user_id = NULL WHERE id = $1`,
      [fromSeatId]
    )
    await client.query(
      `UPDATE seats SET status = 'booked', reserved_until = NULL, reserved_by_user_id = NULL WHERE id = $1`,
      [toSeatId]
    )
    await client.query('UPDATE tickets SET seat_id = $1 WHERE id = $2', [toSeatId, ticketId])

    await client.query('COMMIT')
    return {
      booking_id: bookingId,
      from_seat_id: fromSeatId,
      from_seat_number: fromSeat.seat_number,
      to_seat_id: toSeatId,
      to_seat_number: toSeat.seat_number,
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

module.exports = {
  listSeatsByFlight,
  lockSeats,
  confirmSeats,
  swapSeat,
  releaseExpiredReservations,
}
