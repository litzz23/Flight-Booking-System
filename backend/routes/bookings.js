const router = require('express').Router()
const pool = require('../db/pool')
const { authenticate } = require('../middleware/auth')
const { getCancellationPreview } = require('../utils/cancellationPolicy')
const { applyWalletChange, roundMoney } = require('../utils/walletLedger')

function attachCancellation(row) {
  return {
    ...row,
    cancellation: getCancellationPreview({
      departure_time: row.departure_time,
      flight_status: row.flight_status,
      total_price: row.total_price,
      booking_status: row.status,
    }),
  }
}

function normalizePassengerDetails(body, paxCount) {
  const { passenger_details, passenger_name, passenger_email, passenger_phone } = body
  let list = passenger_details

  if (Array.isArray(list) && list.length > 0) {
    if (list.length !== paxCount) return null
    return list.map((p) => ({
      name: String(p.name || '').trim(),
      email: String(p.email || '').trim(),
      phone: p.phone != null && String(p.phone).trim() !== '' ? String(p.phone).trim() : null,
    }))
  }

  if (passenger_name && passenger_email) {
    return [
      {
        name: String(passenger_name).trim(),
        email: String(passenger_email).trim(),
        phone: passenger_phone != null && String(passenger_phone).trim() !== '' ? String(passenger_phone).trim() : null,
      },
    ]
  }

  return null
}

function validatePassengerDetails(details, paxCount) {
  if (!details || details.length !== paxCount) {
    return { ok: false, error: `Provide name, email, and optional phone for all ${paxCount} passenger(s).` }
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (let i = 0; i < details.length; i++) {
    const p = details[i]
    if (!p.name || !p.email) {
      return { ok: false, error: `Passenger ${i + 1}: name and email are required.` }
    }
    if (!emailRe.test(p.email)) {
      return { ok: false, error: `Passenger ${i + 1}: enter a valid email address.` }
    }
  }
  return { ok: true }
}

// Create a booking (paid from wallet)
router.post('/', authenticate, async (req, res) => {
  const { flight_id, passengers, seat_class } = req.body

  if (!flight_id) {
    return res.status(400).json({ error: 'flight_id is required.' })
  }

  const paxCount = passengers || 1
  const seatClass = seat_class || 'Economy'

  const details = normalizePassengerDetails(req.body, paxCount)
  const check = validatePassengerDetails(details, paxCount)
  if (!check.ok) {
    return res.status(400).json({ error: check.error })
  }

  const primary = details[0]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.user.id])

    const flightResult = await client.query('SELECT * FROM flights WHERE id = $1 FOR UPDATE', [flight_id])
    if (flightResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Flight not found.' })
    }

    const flight = flightResult.rows[0]

    if (flight.status !== 'scheduled') {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Flight is ${flight.status}, cannot book.` })
    }

    if (flight.available_seats < paxCount) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: `Only ${flight.available_seats} seats available.` })
    }

    const totalPrice = roundMoney(parseFloat(flight.price) * paxCount)

    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, flight_id, passengers, total_price, passenger_name, passenger_email, passenger_phone, seat_class, passenger_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        req.user.id,
        flight_id,
        paxCount,
        totalPrice,
        primary.name,
        primary.email,
        primary.phone,
        seatClass,
        JSON.stringify(details),
      ]
    )

    const booking = bookingResult.rows[0]

    await applyWalletChange(client, {
      userId: req.user.id,
      delta: -totalPrice,
      type: 'booking_payment',
      referenceId: booking.id,
      description: `Flight booking #${booking.id} · ${flight.flight_number} ${flight.origin} → ${flight.destination}`,
    })

    await client.query(
      'UPDATE flights SET available_seats = available_seats - $1 WHERE id = $2',
      [paxCount, flight_id]
    )

    await client.query('COMMIT')

    res.status(201).json(booking)
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    if (err.code === 'INSUFFICIENT_FUNDS') {
      return res.status(402).json({ error: err.message, code: err.code })
    }
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// Get all bookings for the logged-in user
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, f.flight_number, f.airline, f.origin, f.destination, f.departure_time, f.arrival_time, f.status AS flight_status,
        COALESCE((
          SELECT json_agg(json_build_object(
            'ticket_id', t.id,
            'seat_id', s.id,
            'seat_number', s.seat_number,
            'passenger_name', t.passenger_name,
            'gender', t.gender
          ) ORDER BY t.id)
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = b.id
        ), '[]'::json) AS seat_assignments
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.id]
    )
    res.json(result.rows.map(attachCancellation))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get a single booking by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, f.flight_number, f.airline, f.origin, f.destination, f.departure_time, f.arrival_time, f.status AS flight_status,
        COALESCE((
          SELECT json_agg(json_build_object(
            'ticket_id', t.id,
            'seat_id', s.id,
            'seat_number', s.seat_number,
            'passenger_name', t.passenger_name,
            'gender', t.gender
          ) ORDER BY t.id)
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = b.id
        ), '[]'::json) AS seat_assignments
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.user.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' })
    }
    res.json(attachCancellation(result.rows[0]))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Cancel a booking
router.patch('/:id/cancel', authenticate, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const bookingResult = await client.query(
      `SELECT b.*, f.departure_time, f.status AS flight_status
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.id = $1 AND b.user_id = $2
       FOR UPDATE`,
      [req.params.id, req.user.id]
    )

    if (bookingResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Booking not found.' })
    }

    const booking = bookingResult.rows[0]

    const preview = getCancellationPreview({
      departure_time: booking.departure_time,
      flight_status: booking.flight_status,
      total_price: booking.total_price,
      booking_status: booking.status,
    })

    if (!preview.allowed) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: preview.reason, code: preview.code })
    }

    await client.query(
      "UPDATE bookings SET status = 'cancelled' WHERE id = $1",
      [req.params.id]
    )

    const seatResult = await client.query(
      `SELECT t.seat_id
       FROM tickets t
       WHERE t.booking_id = $1`,
      [req.params.id]
    )
    const seatIds = seatResult.rows.map((r) => r.seat_id)
    if (seatIds.length > 0) {
      await client.query(
        `UPDATE seats
         SET status = 'available',
             reserved_until = NULL,
             reserved_by_user_id = NULL
         WHERE id = ANY($1::int[])`,
        [seatIds]
      )
    }
    await client.query('DELETE FROM tickets WHERE booking_id = $1', [req.params.id])

    await client.query(
      'UPDATE flights SET available_seats = available_seats + $1 WHERE id = $2',
      [booking.passengers, booking.flight_id]
    )

    const refund = roundMoney(preview.refund_amount || 0)
    if (refund > 0) {
      await applyWalletChange(client, {
        userId: req.user.id,
        delta: refund,
        type: 'refund',
        referenceId: booking.id,
        description: `Refund for cancelled booking #${booking.id} (${preview.policy_label})`,
      })
    }

    await client.query('COMMIT')

    res.json({
      message: 'Booking cancelled successfully. Your seats have been released.',
      refund_amount: preview.refund_amount,
      fee_amount: preview.fee_amount,
      policy_label: preview.policy_label,
      wallet_credit: refund,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
