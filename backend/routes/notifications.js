const router = require("express").Router();
const pool = require("../db/pool");
const { authenticate } = require("../middleware/auth");

router.get("/", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const [listResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, user_id, type, title, message, is_read, related_booking_id, related_flight_id, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND is_read = false`,
        [userId],
      ),
    ]);
    res.json({
      notifications: listResult.rows,
      unread_count: countResult.rows[0]?.c ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/flight-alerts", authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT id, user_id, type, title, message, is_read, related_booking_id, related_flight_id, created_at
       FROM notifications
       WHERE user_id = $1
         AND related_flight_id IS NOT NULL
         AND type IN ('delay', 'cancelled', 'weather', 'disaster', 'info', 'alert')
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId],
    );
    res.json({ notifications: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/read-all", authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id],
    );
    res.json({ updated: r.rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid notification id." });
    }
    const r = await pool.query(
      `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id],
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid notification id." });
    }
    const r = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [id, req.user.id],
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json({ deleted: true, notification: r.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
