const jwt = require('jsonwebtoken')
const pool = require('../db/pool')
require('dotenv').config()

let hasIsActiveColumn = null

const detectIsActiveColumn = async () => {
  if (hasIsActiveColumn !== null) return hasIsActiveColumn
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'is_active'
    ) AS has_column`,
  )
  hasIsActiveColumn = result.rows[0]?.has_column === true
  return hasIsActiveColumn
}

const authenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const hasColumn = await detectIsActiveColumn()
    const userResult = await pool.query(
      hasColumn
        ? 'SELECT id, role, is_active FROM users WHERE id = $1'
        : 'SELECT id, role, true AS is_active FROM users WHERE id = $1',
      [decoded.id],
    )
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token.' })
    }
    const dbUser = userResult.rows[0]
    if (dbUser.is_active === false) {
      return res.status(403).json({ error: 'This account has been deactivated.' })
    }
    req.user = {
      ...decoded,
      id: dbUser.id,
      role: dbUser.role,
    }
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token.' })
  }
}

const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' })
  }
  next()
}

const authorizeUser = (req, res, next) => {
  if (req.user.role !== 'user') {
    return res.status(403).json({ error: 'User access required.' })
  }
  next()
}

/** Attaches user if token is present; leaves request anonymous otherwise. */
const optionalAuthenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return next()
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const hasColumn = await detectIsActiveColumn()
    const userResult = await pool.query(
      hasColumn
        ? 'SELECT id, role, is_active FROM users WHERE id = $1'
        : 'SELECT id, role, true AS is_active FROM users WHERE id = $1',
      [decoded.id],
    )
    if (!userResult.rows.length || userResult.rows[0].is_active === false) {
      req.user = undefined
      return next()
    }
    req.user = {
      ...decoded,
      id: userResult.rows[0].id,
      role: userResult.rows[0].role,
    }
  } catch {
    req.user = undefined
  }
  next()
}

module.exports = { authenticate, authorizeAdmin, authorizeUser, optionalAuthenticate }
