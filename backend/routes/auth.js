const router = require('express').Router()
const pool = require('../db/pool')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { authenticate } = require('../middleware/auth')

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' })
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const result = await pool.query(
      'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone, role, created_at, wallet_balance',
      [name, email, hashedPassword, phone || null]
    )

    const user = result.rows[0]
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.status(201).json({ user, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const user = result.rows[0]
    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    const { password: _, ...userWithoutPassword } = user
    res.json({ user: userWithoutPassword, token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Get current user profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role, created_at, wallet_balance FROM users WHERE id = $1',
      [req.user.id]
    )
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
