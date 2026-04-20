const pool = require('../db/pool')
const bcrypt = require('bcrypt')
const { roundMoney } = require('../utils/walletLedger')

const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id
    const [totals, upcoming, spent, wallet, statusCount] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total_bookings FROM bookings WHERE user_id = $1', [userId]),
      pool.query(
        `SELECT COUNT(*)::int AS upcoming_flights
         FROM bookings b
         JOIN flights f ON f.id = b.flight_id
         WHERE b.user_id = $1
           AND b.status = 'confirmed'
           AND f.departure_time >= NOW()`,
        [userId]
      ),
      pool.query(
        `SELECT COALESCE(SUM(total_price), 0)::numeric(12,2) AS total_spent
         FROM bookings
         WHERE user_id = $1
           AND status IN ('confirmed', 'completed')`,
        [userId]
      ),
      pool.query('SELECT wallet_balance FROM users WHERE id = $1', [userId]),
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_bookings,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_bookings
         FROM bookings
         WHERE user_id = $1`,
        [userId]
      ),
    ])

    res.json({
      totalBookings: totals.rows[0].total_bookings,
      upcomingFlights: upcoming.rows[0].upcoming_flights,
      totalSpent: spent.rows[0].total_spent,
      walletBalance: roundMoney(wallet.rows[0]?.wallet_balance || 0),
      confirmedBookings: statusCount.rows[0].confirmed_bookings,
      cancelledBookings: statusCount.rows[0].cancelled_bookings,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getDashboardAnalytics = async (req, res) => {
  try {
    const userId = req.user.id
    const now = new Date()
    let y = parseInt(String(req.query.year || ''), 10)
    let month = parseInt(String(req.query.month || ''), 10)
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      y = now.getFullYear()
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      month = now.getMonth() + 1
    }

    const pad2 = (n) => String(n).padStart(2, '0')
    const lastDom = new Date(y, month, 0).getDate()
    const startStr = `${y}-${pad2(month)}-01`
    const endStr = `${y}-${pad2(month)}-${pad2(lastDom)}`
    const monthLabel = new Date(y, month - 1, 1).toLocaleString('en-GB', {
      month: 'long',
      year: 'numeric',
    })

    const [bookingsDaily, spendingDaily] = await Promise.all([
      pool.query(
        `SELECT (series.day)::date AS day,
          COUNT(b.id)::int AS count
         FROM generate_series($1::timestamp, $2::timestamp, INTERVAL '1 day') AS series(day)
         LEFT JOIN bookings b
           ON b.created_at::date = (series.day)::date
          AND b.user_id = $3
         GROUP BY (series.day)::date
         ORDER BY (series.day)::date`,
        [`${startStr} 00:00:00`, `${endStr} 00:00:00`, userId]
      ),
      pool.query(
        `SELECT (series.day)::date AS day,
          COALESCE(SUM(b.total_price), 0)::numeric(12,2) AS total
         FROM generate_series($1::timestamp, $2::timestamp, INTERVAL '1 day') AS series(day)
         LEFT JOIN bookings b
           ON b.created_at::date = (series.day)::date
          AND b.user_id = $3
          AND b.status IN ('confirmed', 'completed')
         GROUP BY (series.day)::date
         ORDER BY (series.day)::date`,
        [`${startStr} 00:00:00`, `${endStr} 00:00:00`, userId]
      ),
    ])

    res.json({
      bookingsPerDayInMonth: bookingsDaily.rows.map((row) => ({ day: row.day, count: Number(row.count) })),
      bookingsDayMonthMeta: { year: y, month, monthLabel },
      spendingPerDayInMonth: spendingDaily.rows.map((row) => ({ day: row.day, total: Number(row.total) })),
      spendingDayMonthMeta: { year: y, month, monthLabel },
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getUserBookings = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        b.id,
        b.user_id,
        b.flight_id,
        b.status,
        b.total_price,
        b.passengers,
        b.created_at,
        b.booking_date,
        f.flight_number,
        f.airline,
        f.origin,
        f.destination,
        f.departure_time,
        f.arrival_time
      FROM bookings b
      JOIN flights f ON f.id = b.flight_id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const cancelBooking = async (req, res) => {
  try {
    const booking = await pool.query(
      'SELECT id, status FROM bookings WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    )
    if (booking.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found.' })
    }
    if (booking.rows[0].status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled.' })
    }
    const updated = await pool.query(
      "UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND user_id = $2 RETURNING *",
      [req.params.id, req.user.id]
    )
    res.json(updated.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getWallet = async (req, res) => {
  try {
    const result = await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id])
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }
    res.json({ balance: roundMoney(result.rows[0].wallet_balance) })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const getTransactions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, amount, balance_after, type, reference_id, description, created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' })
    }

    const userResult = await pool.query('SELECT id, password FROM users WHERE id = $1', [req.user.id])
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const user = userResult.rows[0]
    const isMatch = await bcrypt.compare(currentPassword, user.password)
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id])
    res.json({ message: 'Password changed successfully.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getDashboardStats,
  getDashboardAnalytics,
  getUserBookings,
  cancelBooking,
  getWallet,
  getTransactions,
  changePassword,
}
