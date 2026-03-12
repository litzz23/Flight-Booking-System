const router = require('express').Router()
const pool = require('../db/pool')
const { authenticate } = require('../middleware/auth')
const { applyWalletChange, roundMoney } = require('../utils/walletLedger')

const MIN_TOPUP = 100
const MAX_TOPUP = 500_000

router.get('/', authenticate, async (req, res) => {
  try {
    const bal = await pool.query('SELECT wallet_balance FROM users WHERE id = $1', [req.user.id])
    if (bal.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' })
    }

    const tx = await pool.query(
      `SELECT id, amount, balance_after, type, reference_id, description, created_at
       FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    )

    res.json({
      balance: roundMoney(bal.rows[0].wallet_balance),
      transactions: tx.rows,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Simulated add funds (demo — no real payment processor). */
router.post('/add-funds', authenticate, async (req, res) => {
  let amount = Number(req.body.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Enter a valid amount in NPR.' })
  }
  amount = roundMoney(amount)
  if (amount < MIN_TOPUP) {
    return res.status(400).json({ error: `Minimum top-up is NPR ${MIN_TOPUP.toLocaleString()}.` })
  }
  if (amount > MAX_TOPUP) {
    return res.status(400).json({ error: `Maximum single top-up is NPR ${MAX_TOPUP.toLocaleString()}.` })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { balance_after } = await applyWalletChange(client, {
      userId: req.user.id,
      delta: amount,
      type: 'top_up',
      referenceId: null,
      description: `Added NPR ${amount.toLocaleString()} to wallet`,
    })
    await client.query('COMMIT')

    res.status(201).json({
      message: 'Funds added successfully.',
      balance: balance_after,
      added: amount,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

module.exports = router
