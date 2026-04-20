/** Wallet balance + transaction helpers for one DB transaction scope. */

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

async function applyWalletChange(client, { userId, delta, type, referenceId, description }) {
  const r = await client.query('SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [userId])
  if (r.rows.length === 0) {
    const err = new Error('User not found.')
    err.code = 'USER_NOT_FOUND'
    throw err
  }

  const balance = roundMoney(r.rows[0].wallet_balance)
  const d = roundMoney(delta)
  const next = roundMoney(balance + d)

  if (next < 0) {
    const err = new Error(
      `Insufficient wallet balance. You need NPR ${roundMoney(-d).toLocaleString()} but only have NPR ${balance.toLocaleString()}.`
    )
    err.code = 'INSUFFICIENT_FUNDS'
    err.balance = balance
    err.required = roundMoney(-d)
    throw err
  }

  await client.query('UPDATE users SET wallet_balance = $1 WHERE id = $2', [next, userId])

  await client.query(
    `INSERT INTO wallet_transactions (user_id, amount, balance_after, type, reference_id, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, d, next, type, referenceId ?? null, description ?? null]
  )

  return { balance_after: next }
}

module.exports = { applyWalletChange, roundMoney }
