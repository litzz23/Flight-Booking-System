const router = require('express').Router()
const pool = require('../db/pool')
const { authenticate, authorizeAdmin } = require('../middleware/auth')

// Get all flights (with optional search filters)
router.get('/', async (req, res) => {
  try {
    const { origin, destination, date, status } = req.query

    let query = 'SELECT * FROM flights WHERE 1=1'
    const params = []

    if (origin) {
      params.push(origin)
      query += ` AND LOWER(origin) = LOWER($${params.length})`
    }

    if (destination) {
      params.push(destination)
      query += ` AND LOWER(destination) = LOWER($${params.length})`
    }

    if (date) {
      params.push(date)
      query += ` AND DATE(departure_time) = $${params.length}`
    }

    if (status) {
      params.push(status)
      query += ` AND status = $${params.length}`
    }

    query += ' ORDER BY departure_time ASC'

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Filter metadata (origins, destinations, airlines) — must be before /:id
router.get('/meta', async (req, res) => {
  try {
    const [origins, destinations, airlines] = await Promise.all([
      pool.query("SELECT DISTINCT origin FROM flights WHERE status = 'scheduled' ORDER BY origin"),
      pool.query("SELECT DISTINCT destination FROM flights WHERE status = 'scheduled' ORDER BY destination"),
      pool.query("SELECT DISTINCT airline FROM flights WHERE status = 'scheduled' ORDER BY airline"),
    ])
    res.json({
      origins: origins.rows.map((r) => r.origin),
      destinations: destinations.rows.map((r) => r.destination),
      airlines: airlines.rows.map((r) => r.airline),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Deals: optional ?origin=, ?include_all=1 — all scheduled flights (for one-per-destination top deals)
router.get('/deals', async (req, res) => {
  try {
    const { origin, include_all } = req.query
    let query = `SELECT * FROM flights 
       WHERE status = 'scheduled' AND available_seats > 0`
    const params = []
    if (include_all !== '1' && include_all !== 'true') {
      query += ' AND discount > 0'
    }
    if (origin) {
      params.push(origin)
      query += ` AND LOWER(origin) = LOWER($${params.length})`
    }
    query += ' ORDER BY departure_time ASC'
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get single flight by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM flights WHERE id = $1', [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flight not found.' })
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Create a new flight (admin only)
router.post('/', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const {
      flight_number, airline, origin, destination,
      departure_time, arrival_time, price, original_price,
      total_seats, image_url, tagline, discount
    } = req.body

    if (!flight_number || !airline || !origin || !destination || !departure_time || !arrival_time || !price) {
      return res.status(400).json({ error: 'Missing required flight fields.' })
    }

    const result = await pool.query(
      `INSERT INTO flights (flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, image_url, tagline, discount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12)
       RETURNING *`,
      [flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price || price, total_seats || 180, image_url || null, tagline || null, discount || 0]
    )

    res.status(201).json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update a flight (admin only)
router.put('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const {
      flight_number, airline, origin, destination,
      departure_time, arrival_time, price, original_price,
      total_seats, available_seats, status, image_url, tagline, discount
    } = req.body

    const result = await pool.query(
      `UPDATE flights SET
        flight_number = COALESCE($1, flight_number),
        airline = COALESCE($2, airline),
        origin = COALESCE($3, origin),
        destination = COALESCE($4, destination),
        departure_time = COALESCE($5, departure_time),
        arrival_time = COALESCE($6, arrival_time),
        price = COALESCE($7, price),
        original_price = COALESCE($8, original_price),
        total_seats = COALESCE($9, total_seats),
        available_seats = COALESCE($10, available_seats),
        status = COALESCE($11, status),
        image_url = COALESCE($12, image_url),
        tagline = COALESCE($13, tagline),
        discount = COALESCE($14, discount)
       WHERE id = $15
       RETURNING *`,
      [flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, status, image_url, tagline, discount, req.params.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flight not found.' })
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Delete a flight (admin only)
router.delete('/:id', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM flights WHERE id = $1 RETURNING id', [req.params.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flight not found.' })
    }
    res.json({ message: 'Flight deleted successfully.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
