const router = require('express').Router()
const pool = require('../db/pool')
const { authenticate } = require('../middleware/auth')

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id

    const routeResult = await pool.query(
      `SELECT f.origin, f.destination, COUNT(*)::int AS trips
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.user_id = $1 AND b.status != 'cancelled'
       GROUP BY f.origin, f.destination
       ORDER BY trips DESC
       LIMIT 1`,
      [userId],
    )

    let preferred_route = null
    let recommended_flights = []
    let deal_flights = []

    if (routeResult.rows.length > 0) {
      const row = routeResult.rows[0]
      preferred_route = {
        origin: row.origin,
        destination: row.destination,
        trips: Number(row.trips),
      }

      const rec = await pool.query(
        `SELECT * FROM flights
         WHERE origin = $1 AND destination = $2
         AND departure_time > NOW()
         AND available_seats > 0
         AND status = 'scheduled'
         ORDER BY price ASC
         LIMIT 3`,
        [preferred_route.origin, preferred_route.destination],
      )
      recommended_flights = rec.rows

      const deals = await pool.query(
        `SELECT * FROM flights
         WHERE discount > 0
         AND departure_time > NOW()
         AND available_seats > 0
         AND status = 'scheduled'
         AND LOWER(TRIM(destination)) != LOWER(TRIM($1::text))
         ORDER BY discount DESC
         LIMIT 2`,
        [preferred_route.destination],
      )
      deal_flights = deals.rows
    } else {
      const cheap = await pool.query(
        `SELECT * FROM flights
         WHERE departure_time > NOW()
         AND available_seats > 0
         AND status = 'scheduled'
         ORDER BY price ASC
         LIMIT 5`,
      )
      recommended_flights = cheap.rows

      const deals = await pool.query(
        `SELECT * FROM flights
         WHERE discount > 0
         AND departure_time > NOW()
         AND available_seats > 0
         AND status = 'scheduled'
         ORDER BY discount DESC
         LIMIT 2`,
      )
      deal_flights = deals.rows
    }

    res.json({
      preferred_route,
      recommended_flights,
      deal_flights,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
