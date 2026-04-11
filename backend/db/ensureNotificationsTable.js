const pool = require("./pool");

async function ensureNotificationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(150) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT false,
      related_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      related_flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS related_flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_notifications_related_flight ON notifications(related_flight_id, created_at DESC)
  `);
}

module.exports = { ensureNotificationsTable };
