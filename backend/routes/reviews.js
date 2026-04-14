const router = require("express").Router();
const pool = require("../db/pool");
const { authenticate } = require("../middleware/auth");

const DEFAULT_REVIEWS = [
  {
    name: "Aayush Thapa",
    route: "Kathmandu to Pokhara",
    rating: 5,
    text: "Smooth booking and clear pricing. I found my flight in less than a minute.",
  },
  {
    name: "Sanjana Karki",
    route: "Bharatpur to Kathmandu",
    rating: 4,
    text: "The design is very clean and the booking details were easy to understand.",
  },
  {
    name: "Ramesh Shrestha",
    route: "Kathmandu to Lukla",
    rating: 5,
    text: "Great experience from route search to payment confirmation. Will use again.",
  },
];

let ensureReviewsTablePromise;

async function ensureReviewsTable() {
  if (!ensureReviewsTablePromise) {
    ensureReviewsTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          route VARCHAR(120) NOT NULL,
          rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
          text VARCHAR(500) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM reviews");
      if (rows[0]?.count === 0) {
        const values = [];
        const params = [];
        DEFAULT_REVIEWS.forEach((review, index) => {
          const base = index * 4;
          values.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`,
          );
          params.push(review.name, review.route, review.rating, review.text);
        });
        await pool.query(
          `INSERT INTO reviews (name, route, rating, text) VALUES ${values.join(", ")}`,
          params,
        );
      }
    })();
  }

  return ensureReviewsTablePromise;
}

router.get("/", async (req, res) => {
  try {
    await ensureReviewsTable();
    const result = await pool.query(
      `SELECT id, name, route, rating, text, created_at
       FROM reviews
       ORDER BY created_at DESC, id DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    await ensureReviewsTable();
    const name = String(req.body?.name || "").trim();
    const route = String(req.body?.route || "").trim();
    const text = String(req.body?.text || "").trim();
    const rating = Number(req.body?.rating);

    if (!name || !route || !text) {
      return res
        .status(400)
        .json({ error: "Please fill in all fields before posting your review." });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5." });
    }

    const result = await pool.query(
      `INSERT INTO reviews (name, route, rating, text)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, route, rating, text, created_at`,
      [name, route, rating, text],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
