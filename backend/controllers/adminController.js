const pool = require("../db/pool");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { seedSeatsForFlight } = require("../db/seatSeeder");
const { createNotification } = require("../utils/notificationHelper");
const { applyWalletChange, roundMoney } = require("../utils/walletLedger");
const { syncPastFlightsStatus } = require("../utils/flightStatus");
const { sendEmail } = require("../utils/sendEmail");
const {
  bookingCancelledByAdmin,
  flightCancelledWithRefund,
  flightDelayed,
} = require("../utils/emailTemplates");
const {
  generateNextWeekFlights,
} = require("../services/weeklyFlightGenerator");

const monthExpr = `TO_CHAR(DATE_TRUNC('month', created_at), 'Mon')`;
const monthGroupExpr = `DATE_TRUNC('month', created_at)`;

const allowedFlightStatus = ["scheduled", "delayed", "cancelled", "completed"];
const MAX_FLIGHT_DURATION_MINUTES = 8 * 60;
/** Admin flight CRUD always uses the backend fixed seat count. */
const FLIGHT_TOTAL_SEATS = 72;
const normalizedCityExpr = (valueSql) =>
  `REGEXP_REPLACE(LOWER(TRIM(${valueSql})), '(.)\\1+', '\\1', 'g')`;

async function ensureUserActiveColumn(client = pool) {
  await client.query(
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
  );
}

function renderAdminAlertEmailHtml({ passengerName, title, message, route, departureTime }) {
  const safeName = String(passengerName || "Passenger");
  const dep = departureTime ? new Date(departureTime).toLocaleString() : null;
  return `
    <div style="margin:0;padding:24px;background:#08111f;font-family:Arial,Helvetica,sans-serif;color:#f5f7fb;">
      <div style="max-width:620px;margin:0 auto;background:#1a1f2e;border:1px solid #263042;border-radius:16px;overflow:hidden;">
        <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.08);background:linear-gradient(180deg,#0f1b2f 0%,#09101c 100%);">
          <p style="margin:0 0 8px;color:#93c5fd;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;font-weight:700;">Binayak Airlines</p>
          <h2 style="margin:0;color:#ffffff;font-size:22px;line-height:1.3;">${title}</h2>
          <p style="margin:12px 0 0;color:#c7d2e5;font-size:14px;line-height:1.6;">Hi ${safeName}, ${message}</p>
        </div>
        <div style="padding:20px 24px;color:#e2e8f0;font-size:14px;line-height:1.7;">
          ${route ? `<p style="margin:0 0 8px;"><strong>Route:</strong> ${route}</p>` : ""}
          ${dep ? `<p style="margin:0;"><strong>Departure:</strong> ${dep}</p>` : ""}
        </div>
      </div>
    </div>
  `;
}

/** Cancels confirmed bookings for a flight and applies wallet refunds. */
async function cancelConfirmedBookingsAndRefundForFlight(client, flightId) {
  const { rows } = await client.query(
    `SELECT * FROM bookings
     WHERE flight_id = $1 AND status = 'confirmed'
     ORDER BY id
     FOR UPDATE`,
    [flightId],
  );
  const out = [];
  for (const booking of rows) {
    const refund = roundMoney(booking.total_price);
    await client.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = $1`,
      [booking.id],
    );
    const seatResult = await client.query(
      `SELECT seat_id FROM tickets WHERE booking_id = $1`,
      [booking.id],
    );
    const seatIds = seatResult.rows.map((r) => r.seat_id);
    if (seatIds.length > 0) {
      await client.query(
        `UPDATE seats
         SET status = 'available',
             reserved_until = NULL,
             reserved_by_user_id = NULL
         WHERE id = ANY($1::int[])`,
        [seatIds],
      );
    }
    await client.query(`DELETE FROM tickets WHERE booking_id = $1`, [
      booking.id,
    ]);
    await client.query(
      `UPDATE flights SET available_seats = available_seats + $1 WHERE id = $2`,
      [booking.passengers, flightId],
    );
    if (refund > 0) {
      await applyWalletChange(client, {
        userId: booking.user_id,
        delta: refund,
        type: "refund",
        referenceId: booking.id,
        description: `Full refund — flight cancelled by airline (booking #${booking.id})`,
      });
    }
    out.push({ booking, refund });
  }
  return out;
}

function getFlightDurationMinutes(departureTime, arrivalTime) {
  const dep = new Date(departureTime);
  const arr = new Date(arrivalTime);
  const duration = Math.round((arr - dep) / 60000);
  return Number.isFinite(duration) ? duration : NaN;
}

const getAdminAlertFlights = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.flight_number, f.airline, f.origin, f.destination,
                f.departure_time, f.status,
                COUNT(b.id)::int AS booked_passengers
         FROM flights f
         LEFT JOIN bookings b ON b.flight_id = f.id AND b.status = 'confirmed'
         WHERE f.status = 'scheduled' OR f.status = 'delayed'
         GROUP BY f.id
         ORDER BY f.departure_time ASC`,
    );
    res.json({ flights: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const broadcastAdminAlert = async (req, res) => {
  const { title, message, type, flight_id, delay_minutes, target } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: "Title and message are required." });
  }

  const alertType = type || "alert";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let userRows;
    let flightContext = null;
    let cancelledRefundRows = [];
    if (flight_id) {
      const flightResult = await client.query(
        `SELECT id, status, flight_number, origin, destination, departure_time
         FROM flights
         WHERE id = $1
         FOR UPDATE`,
        [flight_id],
      );
      if (!flightResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Flight not found." });
      }
      flightContext = flightResult.rows[0];

      const currentFlightStatus = String(flightResult.rows[0].status || "");
      if (currentFlightStatus === "completed") {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Completed flights cannot be modified." });
      }

      const result = await client.query(
        `SELECT DISTINCT b.user_id, u.name, u.email
           FROM bookings b
           JOIN users u ON u.id = b.user_id
           WHERE b.flight_id = $1 AND b.status = 'confirmed'`,
        [flight_id],
      );
      userRows = result.rows;

      if (alertType === "delay") {
        const minutes = Number(delay_minutes);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error:
              "Delay duration is required and must be greater than 0 minutes.",
          });
        }
        const updatedFlight = await client.query(
          `UPDATE flights SET
              status = 'delayed',
              departure_time = departure_time + ($1 || ' minutes')::interval,
              arrival_time = arrival_time + ($1 || ' minutes')::interval
             WHERE id = $2 AND status IN ('scheduled', 'delayed')
             RETURNING id, status, flight_number, origin, destination, departure_time`,
          [minutes, flight_id],
        );
        if (!updatedFlight.rowCount) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "Flight cannot be delayed in its current status." });
        }
        flightContext = updatedFlight.rows[0];
      } else if (alertType === "cancelled") {
        const cancelledFlight = await client.query(
          `UPDATE flights
             SET status = 'cancelled'
             WHERE id = $1 AND status IN ('scheduled', 'delayed')
             RETURNING id, status, flight_number, origin, destination, departure_time`,
          [flight_id],
        );
        if (!cancelledFlight.rowCount) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "Flight cannot be cancelled in its current status." });
        }
        flightContext = cancelledFlight.rows[0];
        cancelledRefundRows = await cancelConfirmedBookingsAndRefundForFlight(
          client,
          flight_id,
        );
      }
    } else {
      const result = await client.query(
        `SELECT id AS user_id, name, email FROM users WHERE role = 'user'`,
      );
      userRows = result.rows;
    }

    if (!userRows.length) {
      await client.query("COMMIT");
      return res.json({
        sent: 0,
        message: "No passengers found for this flight.",
      });
    }

    for (const row of userRows) {
      await client.query(
        "INSERT INTO notifications (user_id, type, title, message, related_booking_id, related_flight_id) VALUES ($1,$2,$3,$4,$5,$6)",
        [row.user_id, alertType, title, message, null, flight_id || null],
      );
    }

    await client.query("COMMIT");

    const routeLabel =
      flightContext && flightContext.flight_number
        ? `${flightContext.flight_number} (${flightContext.origin} -> ${flightContext.destination})`
        : null;

    if (alertType === "delay" && flightContext) {
      for (const row of userRows) {
        const mail = flightDelayed({
          passengerName: row.name,
          flightNumber: flightContext.flight_number,
          origin: flightContext.origin,
          destination: flightContext.destination,
          departureTime: flightContext.departure_time,
        });
        sendEmail(row.email, mail.subject, mail.html).catch((e) =>
          console.error("admin alert delay email failed:", e.message),
        );
      }
    } else if (alertType === "cancelled" && flightContext) {
      const byUserId = new Map(userRows.map((row) => [Number(row.user_id), row]));
      for (const { booking, refund } of cancelledRefundRows) {
        const user = byUserId.get(Number(booking.user_id)) || {};
        const mail = flightCancelledWithRefund({
          passengerName: user.name,
          bookingId: booking.id,
          flightNumber: flightContext.flight_number,
          origin: flightContext.origin,
          destination: flightContext.destination,
          departureTime: flightContext.departure_time,
          refundAmount: refund,
        });
        sendEmail(user.email, mail.subject, mail.html).catch((e) =>
          console.error("admin alert cancellation email failed:", e.message),
        );
      }
    } else {
      for (const row of userRows) {
        if (!row.email) continue;
        const html = renderAdminAlertEmailHtml({
          passengerName: row.name,
          title,
          message,
          route: routeLabel,
          departureTime: flightContext?.departure_time,
        });
        sendEmail(row.email, title, html).catch((e) =>
          console.error("admin alert email failed:", e.message),
        );
      }
    }

    res.json({
      sent: userRows.length,
      target: target || (flight_id ? "flight-passengers" : "all-users"),
      message: `Alert sent to ${userRows.length} passenger(s).`,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

async function ensureDestinationColumns() {
  await pool.query(
    `ALTER TABLE destinations ADD COLUMN IF NOT EXISTS image_url TEXT`,
  );
  await pool.query(
    `ALTER TABLE destinations ADD COLUMN IF NOT EXISTS tagline VARCHAR(255)`,
  );
  await pool.query(
    `ALTER TABLE destinations ADD COLUMN IF NOT EXISTS region VARCHAR(100)`,
  );
}

function normalizeDiscount(price, originalPrice) {
  if (price != null && originalPrice != null) {
    const p = Number(price);
    const op = Number(originalPrice);
    if (Number.isFinite(p) && Number.isFinite(op) && op > 0) {
      const computed = Math.round((1 - p / op) * 100);
      return Math.max(0, Math.min(100, computed));
    }
  }
  return 0;
}

async function getDestinationDefaults(city) {
  if (!city) return { image_url: null, tagline: null };
  await ensureDestinationColumns();
  const columns = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = 'destinations'`,
  );
  const names = new Set(columns.rows.map((r) => r.column_name));
  const hasImage = names.has("image_url");
  const hasTagline = names.has("tagline");
  if (!hasImage && !hasTagline) return { image_url: null, tagline: null };
  const selectParts = [];
  if (hasImage) selectParts.push("image_url");
  else selectParts.push("NULL::text AS image_url");
  if (hasTagline) selectParts.push("tagline");
  else selectParts.push("NULL::text AS tagline");
  const result = await pool.query(
    `SELECT ${selectParts.join(", ")} FROM destinations WHERE LOWER(city) = LOWER($1) LIMIT 1`,
    [city],
  );
  if (result.rows.length) {
    const row = result.rows[0];
    if (row.image_url || row.tagline) {
      return row;
    }
  }

  const flightFallback = await pool.query(
    `SELECT image_url, tagline
     FROM flights
     WHERE LOWER(destination) = LOWER($1)
       AND (image_url IS NOT NULL OR tagline IS NOT NULL)
     ORDER BY price ASC, departure_time ASC
     LIMIT 1`,
    [city],
  );
  if (!flightFallback.rows.length) return { image_url: null, tagline: null };
  return flightFallback.rows[0];
}

async function resolveFlightMedia({ destination, image_url, tagline }) {
  if (image_url && tagline) return { image_url, tagline };
  const defaults = await getDestinationDefaults(destination);
  return {
    image_url: image_url || defaults.image_url || null,
    tagline: tagline || defaults.tagline || null,
  };
}

const getAdminMe = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1 AND role = $2",
      [req.user.id, "admin"],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Admin not found." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminStats = async (_req, res) => {
  try {
    const [users, flights, bookings, revenue] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total_users FROM users WHERE role = 'user'`,
      ),
      pool.query("SELECT COUNT(*)::int AS total_flights FROM flights"),
      pool.query("SELECT COUNT(*)::int AS total_bookings FROM bookings"),
      pool.query(
        `SELECT COALESCE(SUM(total_price), 0)::numeric(12,2) AS total_revenue FROM bookings WHERE status IN ('confirmed', 'completed')`,
      ),
    ]);

    res.json({
      totalUsers: users.rows[0].total_users,
      totalFlights: flights.rows[0].total_flights,
      totalBookings: bookings.rows[0].total_bookings,
      totalRevenue: Number(revenue.rows[0].total_revenue),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminAnalytics = async (req, res) => {
  try {
    const now = new Date();
    let y = parseInt(String(req.query.year || ""), 10);
    let month = parseInt(String(req.query.month || ""), 10);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
      y = now.getFullYear();
    }
    if (!Number.isFinite(month) || month < 1 || month > 12) {
      month = now.getMonth() + 1;
    }

    const pad2 = (n) => String(n).padStart(2, "0");
    const lastDom = new Date(y, month, 0).getDate();
    const startStr = `${y}-${pad2(month)}-01`;
    const endStr = `${y}-${pad2(month)}-${pad2(lastDom)}`;
    const monthLabel = new Date(y, month - 1, 1).toLocaleString("en-GB", {
      month: "long",
      year: "numeric",
    });

    const monthRangeParams = [`${startStr} 00:00:00`, `${endStr} 00:00:00`];

    const [revenuePerMonth, revenuePerDayInMonth, bookingsPerDayInMonth, bookingStatus] =
      await Promise.all([
        pool.query(
          `SELECT ${monthExpr} AS month, COALESCE(SUM(total_price), 0)::numeric(12,2) AS total
         FROM bookings
         WHERE status IN ('confirmed', 'completed')
         GROUP BY ${monthGroupExpr}, ${monthExpr}
         ORDER BY ${monthGroupExpr}`,
        ),
        pool.query(
          `SELECT (series.day)::date AS day,
            COALESCE(SUM(b.total_price), 0)::numeric(12,2) AS total
           FROM generate_series($1::timestamp, $2::timestamp, INTERVAL '1 day') AS series(day)
           LEFT JOIN bookings b
             ON (b.created_at::date = (series.day)::date)
            AND b.status IN ('confirmed', 'completed')
           GROUP BY (series.day)::date
           ORDER BY (series.day)::date`,
          monthRangeParams,
        ),
        pool.query(
          `SELECT (series.day)::date AS day,
            COUNT(b.id)::int AS count
           FROM generate_series($1::timestamp, $2::timestamp, INTERVAL '1 day') AS series(day)
           LEFT JOIN bookings b ON b.created_at::date = (series.day)::date
           GROUP BY (series.day)::date
           ORDER BY (series.day)::date`,
          monthRangeParams,
        ),
        pool.query(
          `SELECT
          COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
         FROM bookings
         WHERE created_at::date >= $1::date
           AND created_at::date <= $2::date`,
          [startStr, endStr],
        ),
      ]);

    res.json({
      bookingsPerDayInMonth: bookingsPerDayInMonth.rows.map((row) => ({
        day: row.day,
        count: Number(row.count),
      })),
      bookingsDayMonthMeta: { year: y, month, monthLabel },
      revenuePerMonth: revenuePerMonth.rows.map((row) => ({
        month: row.month,
        total: Number(row.total),
      })),
      revenuePerDayInMonth: revenuePerDayInMonth.rows.map((row) => ({
        day: row.day,
        total: Number(row.total),
      })),
      bookingStatus: [
        { name: "Confirmed", value: Number(bookingStatus.rows[0].confirmed) },
        { name: "Cancelled", value: Number(bookingStatus.rows[0].cancelled) },
      ],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminDestinations = async (_req, res) => {
  try {
    await ensureDestinationColumns();
    const columns = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'destinations'`,
    );
    const names = new Set(columns.rows.map((r) => r.column_name));
    const hasImage = names.has("image_url");
    const hasTagline = names.has("tagline");
    const hasRegion = names.has("region");
    const result = await pool.query(
      `SELECT id, city,
        ${hasImage ? "image_url" : "NULL::text AS image_url"},
        ${hasTagline ? "tagline" : "NULL::text AS tagline"},
        ${hasRegion ? "region" : "NULL::text AS region"},
        created_at
       FROM destinations
       ORDER BY city ASC`,
    );
    const enriched = await Promise.all(
      result.rows.map(async (row) => {
        if (row.image_url || row.tagline) return row;
        const fallback = await pool.query(
          `SELECT image_url, tagline
           FROM flights
           WHERE LOWER(destination) = LOWER($1)
             AND (image_url IS NOT NULL OR tagline IS NOT NULL)
           ORDER BY price ASC, departure_time ASC
           LIMIT 1`,
          [row.city],
        );
        if (!fallback.rows.length) return row;
        return {
          ...row,
          image_url: row.image_url || fallback.rows[0].image_url || null,
          tagline: row.tagline || fallback.rows[0].tagline || null,
        };
      }),
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createAdminDestination = async (req, res) => {
  try {
    await ensureDestinationColumns();
    const { city, image_url, tagline, region } = req.body;
    if (!city || !String(city).trim()) {
      return res.status(400).json({ error: "City is required." });
    }
    const columns = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'destinations'`,
    );
    const names = new Set(columns.rows.map((r) => r.column_name));
    const hasImage = names.has("image_url");
    const hasTagline = names.has("tagline");
    const hasRegion = names.has("region");
    const hasCountry = names.has("country");

    const regionVal =
      region != null && String(region).trim() !== ""
        ? String(region).trim().slice(0, 100)
        : null;

    const insertCols = ["city"];
    const values = [String(city).trim()];
    if (hasImage) {
      insertCols.push("image_url");
      values.push(image_url || null);
    }
    if (hasTagline) {
      insertCols.push("tagline");
      values.push(tagline || null);
    }
    if (hasRegion) {
      insertCols.push("region");
      values.push(regionVal);
    }
    if (hasCountry) {
      insertCols.push("country");
      values.push("Nepal");
    }
    const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
    const result = await pool.query(
      `INSERT INTO destinations (${insertCols.join(", ")})
       VALUES (${placeholders})
       RETURNING id, city,
        ${hasImage ? "image_url" : "NULL::text AS image_url"},
        ${hasTagline ? "tagline" : "NULL::text AS tagline"},
        ${hasRegion ? "region" : "NULL::text AS region"},
        created_at`,
      values,
    );
    generateNextWeekFlights().catch((err) => {
      console.error(
        "Weekly flight generation after destination create failed:",
        err.message,
      );
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "Destination city already exists." });
    }
    res.status(500).json({ error: err.message });
  }
};

const updateAdminDestination = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureDestinationColumns();
    const { city, image_url, tagline, region } = req.body;
    const existing = await client.query(
      `SELECT id, city, image_url, tagline
       FROM destinations
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id],
    );
    if (!existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Destination not found." });
    }

    const oldCity = existing.rows[0].city;

    const columns = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'destinations'`,
    );
    const names = new Set(columns.rows.map((r) => r.column_name));
    const hasImage = names.has("image_url");
    const hasTagline = names.has("tagline");
    const hasRegion = names.has("region");
    const setParts = [`city = COALESCE(NULLIF($1, ''), city)`];
    const params = [city ? String(city).trim() : ""];
    let idx = 2;
    if (hasImage) {
      setParts.push(`image_url = $${idx}`);
      params.push(image_url || null);
      idx += 1;
    }
    if (hasTagline) {
      setParts.push(`tagline = $${idx}`);
      params.push(tagline || null);
      idx += 1;
    }
    if (hasRegion && region !== undefined) {
      const regionVal =
        region != null && String(region).trim() !== ""
          ? String(region).trim().slice(0, 100)
          : null;
      setParts.push(`region = $${idx}`);
      params.push(regionVal);
      idx += 1;
    }
    params.push(req.params.id);
    const result = await client.query(
      `UPDATE destinations
       SET ${setParts.join(", ")}
       WHERE id = $${idx}
       RETURNING id, city,
        ${hasImage ? "image_url" : "NULL::text AS image_url"},
        ${hasTagline ? "tagline" : "NULL::text AS tagline"},
        ${hasRegion ? "region" : "NULL::text AS region"},
        created_at`,
      params,
    );

    const updatedDestination = result.rows[0];
    const newCity = updatedDestination.city;

    await client.query(
      `UPDATE flights
       SET
         origin = CASE
           WHEN ${normalizedCityExpr("origin")} = ${normalizedCityExpr("$2::text")} THEN $1
           ELSE origin
         END,
         destination = CASE
           WHEN ${normalizedCityExpr("destination")} = ${normalizedCityExpr("$2::text")} THEN $1
           ELSE destination
         END,
         image_url = $3,
         tagline = $4
       WHERE ${normalizedCityExpr("origin")} IN (${normalizedCityExpr("$1::text")}, ${normalizedCityExpr("$2::text")})
          OR ${normalizedCityExpr("destination")} IN (${normalizedCityExpr("$1::text")}, ${normalizedCityExpr("$2::text")})`,
      [
        newCity,
        oldCity,
        updatedDestination.image_url || null,
        updatedDestination.tagline || null,
      ],
    );

    await client.query("COMMIT");
    res.json(updatedDestination);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    if (err.code === "23505") {
      return res
        .status(409)
        .json({ error: "Destination city already exists." });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

const deleteAdminDestination = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const destinationResult = await client.query(
      "SELECT city FROM destinations WHERE id = $1",
      [req.params.id],
    );

    if (!destinationResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Destination not found." });
    }

    const city = destinationResult.rows[0].city;

    const affectedFlightsResult = await client.query(
      `SELECT id
       FROM flights
       WHERE (
         ${normalizedCityExpr("origin")} = ${normalizedCityExpr("$1::text")}
         OR ${normalizedCityExpr("destination")} = ${normalizedCityExpr("$1::text")}
       )
       AND status IN ('scheduled', 'delayed')
       ORDER BY id
       FOR UPDATE`,
      [city],
    );

    let cancelledFlightsCount = 0;
    let cancelledBookingsCount = 0;
    for (const row of affectedFlightsResult.rows) {
      const refundResults = await cancelConfirmedBookingsAndRefundForFlight(
        client,
        row.id,
      );
      cancelledBookingsCount += refundResults.length;

      const updateResult = await client.query(
        `UPDATE flights
         SET status = 'cancelled'
         WHERE id = $1
           AND status IN ('scheduled', 'delayed')`,
        [row.id],
      );
      cancelledFlightsCount += updateResult.rowCount;
    }

    await client.query("DELETE FROM destinations WHERE id = $1", [
      req.params.id,
    ]);

    await client.query("COMMIT");

    res.json({
      message: "Destination deleted successfully.",
      cancelledScheduledFlights: cancelledFlightsCount,
      cancelledConfirmedBookings: cancelledBookingsCount,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

const getAdminFlights = async (_req, res) => {
  try {
    await syncPastFlightsStatus(pool);
    const result = await pool.query(
      `SELECT
        id,
        CONCAT(airline, ' ', flight_number) AS "flightName",
        origin AS "from",
        destination AS "to",
        departure_time AS "departureTime",
        arrival_time AS "arrivalTime",
        price,
        original_price,
        discount,
        status,
        image_url,
        tagline,
        airline,
        flight_number
       FROM flights
       ORDER BY departure_time ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createAdminFlight = async (req, res) => {
  try {
    const {
      airline,
      flight_number,
      from,
      to,
      departureTime,
      arrivalTime,
      price,
      original_price,
      status,
      image_url,
      tagline,
    } = req.body;

    if (
      !airline ||
      !flight_number ||
      !from ||
      !to ||
      !departureTime ||
      !arrivalTime ||
      price == null
    ) {
      return res.status(400).json({ error: "All flight fields are required." });
    }
    if (String(from).toLowerCase() === String(to).toLowerCase()) {
      return res
        .status(400)
        .json({ error: "Origin and destination must be different." });
    }
    const finalStatus = status || "scheduled";
    if (!allowedFlightStatus.includes(finalStatus)) {
      return res.status(400).json({ error: "Invalid flight status." });
    }
    const durationMinutes = getFlightDurationMinutes(
      departureTime,
      arrivalTime,
    );
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return res
        .status(400)
        .json({ error: "Arrival time must be after departure time." });
    }
    if (durationMinutes > MAX_FLIGHT_DURATION_MINUTES) {
      return res
        .status(400)
        .json({ error: "Flight duration cannot exceed 8 hours." });
    }
    const priceNum = Number(price);
    const originalPriceNum =
      original_price == null || original_price === ""
        ? priceNum
        : Number(original_price);
    const totalSeatsNum = FLIGHT_TOTAL_SEATS;
    const computedDiscount = normalizeDiscount(priceNum, originalPriceNum);
    if (computedDiscount == null) {
      return res
        .status(400)
        .json({ error: "Discount must be between 0 and 100." });
    }
    const media = await resolveFlightMedia({
      destination: to,
      image_url,
      tagline,
    });

    const result = await pool.query(
      `INSERT INTO flights
       (flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, status, image_url, tagline, discount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, $13)
       RETURNING
        id,
        CONCAT(airline, ' ', flight_number) AS "flightName",
        origin AS "from",
        destination AS "to",
        departure_time AS "departureTime",
        arrival_time AS "arrivalTime",
        price,
        original_price,
        discount,
        total_seats,
        status,
        image_url,
        tagline,
        available_seats AS "seatsAvailable",
        airline,
        flight_number`,
      [
        String(flight_number).trim(),
        String(airline).trim(),
        from,
        to,
        departureTime,
        arrivalTime,
        priceNum,
        originalPriceNum,
        totalSeatsNum,
        finalStatus,
        media.image_url,
        media.tagline,
        computedDiscount,
      ],
    );

    await seedSeatsForFlight(pool, result.rows[0].id);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateAdminFlight = async (req, res) => {
  const {
    airline,
    flight_number,
    from,
    to,
    departureTime,
    arrivalTime,
    price,
    original_price,
    status,
    image_url,
    tagline,
  } = req.body;

  if (
    status != null &&
    status !== "" &&
    !allowedFlightStatus.includes(String(status))
  ) {
    return res.status(400).json({ error: "Invalid flight status." });
  }

  const client = await pool.connect();
  let refundResults = [];
  try {
    await client.query("BEGIN");

    const current = await client.query(
      "SELECT * FROM flights WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!current.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Flight not found." });
    }
    const existing = current.rows[0];
    const finalFrom = from ?? existing.origin;
    const finalTo = to ?? existing.destination;
    const finalDepartureTime = departureTime ?? existing.departure_time;
    const finalArrivalTime = arrivalTime ?? existing.arrival_time;
    if (String(finalFrom).toLowerCase() === String(finalTo).toLowerCase()) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Origin and destination must be different." });
    }
    const durationMinutes = getFlightDurationMinutes(
      finalDepartureTime,
      finalArrivalTime,
    );
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Arrival time must be after departure time." });
    }
    if (durationMinutes > MAX_FLIGHT_DURATION_MINUTES) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Flight duration cannot exceed 8 hours." });
    }

    const nextPrice =
      price == null || price === "" ? Number(existing.price) : Number(price);
    const nextOriginalPrice =
      original_price == null || original_price === ""
        ? price == null || price === ""
          ? Number(existing.original_price ?? existing.price)
          : nextPrice
        : Number(original_price);
    const computedDiscount = normalizeDiscount(nextPrice, nextOriginalPrice);
    if (computedDiscount == null) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: "Discount must be between 0 and 100." });
    }
    const media = await resolveFlightMedia({
      destination: finalTo,
      image_url,
      tagline,
    });

    const result = await client.query(
      `UPDATE flights SET
        airline = COALESCE(NULLIF($1, ''), airline),
        flight_number = COALESCE(NULLIF($2, ''), flight_number),
        origin = COALESCE($3, origin),
        destination = COALESCE($4, destination),
        departure_time = COALESCE($5, departure_time),
        arrival_time = COALESCE($6, arrival_time),
        price = COALESCE($7, price),
        original_price = COALESCE($8, original_price),
        discount = COALESCE($9, discount),
        total_seats = COALESCE($10, total_seats),
        available_seats = LEAST(COALESCE($10, total_seats), available_seats),
        status = COALESCE($11, status),
        image_url = COALESCE($12, image_url),
        tagline = COALESCE($13, tagline)
       WHERE id = $14
       RETURNING
        id,
        CONCAT(airline, ' ', flight_number) AS "flightName",
        origin AS "from",
        destination AS "to",
        departure_time AS "departureTime",
        arrival_time AS "arrivalTime",
        price,
        original_price,
        discount,
        total_seats,
        status,
        image_url,
        tagline,
        available_seats AS "seatsAvailable",
        airline,
        flight_number`,
      [
        airline || "",
        flight_number || "",
        from ?? null,
        to ?? null,
        departureTime ?? null,
        arrivalTime ?? null,
        price == null ? null : Number(price),
        nextOriginalPrice,
        computedDiscount,
        FLIGHT_TOTAL_SEATS,
        status ?? null,
        media.image_url,
        media.tagline,
        req.params.id,
      ],
    );
    const updated = result.rows[0];
    const newStatus = updated.status;
    const prevStatus = existing.status;

    if (
      String(prevStatus) !== "cancelled" &&
      String(newStatus) === "cancelled"
    ) {
      refundResults = await cancelConfirmedBookingsAndRefundForFlight(
        client,
        req.params.id,
      );
    }

    await client.query("COMMIT");

    if (
      String(prevStatus) !== String(newStatus) &&
      ["cancelled", "delayed", "completed"].includes(String(newStatus))
    ) {
      try {
        const fn = updated.flight_number || existing.flight_number;
        const origin = updated.from || existing.origin;
        const dest = updated.to || existing.destination;
        const dep = new Date(
          updated.departureTime || existing.departure_time,
        ).toLocaleDateString();

        if (String(newStatus) === "cancelled") {
          for (const { booking, refund } of refundResults) {
            const refundDisplay = Number(refund).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            });
            const msg =
              refund > 0
                ? `Your flight ${fn} (${origin} → ${dest}) on ${dep} was cancelled by the airline. NPR ${refundDisplay} has been refunded to your wallet for booking #${booking.id}.`
                : `Your flight ${fn} (${origin} → ${dest}) on ${dep} was cancelled by the airline. Booking #${booking.id} has been cancelled.`;
            await createNotification(pool, {
              userId: booking.user_id,
              type: "flight_cancelled",
              title: "Flight cancelled",
              message: msg,
              relatedBookingId: booking.id,
            });

            const userResult = await pool.query(
              "SELECT name, email FROM users WHERE id = $1",
              [booking.user_id],
            );
            const user = userResult.rows[0] || {};
            const mail = flightCancelledWithRefund({
              passengerName: user.name,
              bookingId: booking.id,
              flightNumber: fn,
              origin,
              destination: dest,
              departureTime: updated.departureTime || existing.departure_time,
              refundAmount: refund,
            });
            sendEmail(user.email, mail.subject, mail.html).catch((e) =>
              console.error("flight cancelled email failed:", e.message),
            );
          }
        } else {
          const pax = await pool.query(
            `SELECT b.user_id, b.id AS booking_id, u.name, u.email
             FROM bookings b
             JOIN users u ON u.id = b.user_id
             WHERE b.flight_id = $1 AND b.status = 'confirmed'
             ORDER BY b.id`,
            [req.params.id],
          );
          let title;
          let message;
          if (String(newStatus) === "delayed") {
            title = "Flight delayed";
            message = `Your flight ${fn} (${origin} → ${dest}) on ${dep} is now marked delayed. Check My Bookings for the latest information.`;
          } else {
            title = "Flight completed";
            message = `Your flight ${fn} (${origin} → ${dest}) has been marked completed. Thank you for flying with us.`;
          }
          for (const row of pax.rows) {
            await createNotification(pool, {
              userId: row.user_id,
              type: `flight_${newStatus}`,
              title,
              message,
              relatedBookingId: row.booking_id,
            });

            if (String(newStatus) === "delayed") {
              const mail = flightDelayed({
                passengerName: row.name,
                flightNumber: fn,
                origin,
                destination: dest,
                departureTime: updated.departureTime || existing.departure_time,
              });
              sendEmail(row.email, mail.subject, mail.html).catch((e) =>
                console.error("flight delayed email failed:", e.message),
              );
            }
          }
        }
      } catch (notifyErr) {
        console.error("notify flight status (admin):", notifyErr.message);
      }
    }

    res.json(updated);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

const deleteAdminFlight = async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM flights WHERE id = $1 RETURNING id",
      [req.params.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Flight not found." });
    }
    res.json({ message: "Flight deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminBookings = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        b.id,
        u.name AS "userName",
        CONCAT(f.airline, ' ', f.flight_number) AS "flightName",
        b.booking_date AS date,
        b.status
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN flights f ON f.id = b.flight_id
       ORDER BY b.created_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateAdminBooking = async (req, res) => {
  try {
    const status = String(req.body.status || "").toLowerCase();
    if (!["confirmed", "cancelled"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Status must be confirmed or cancelled." });
    }

    const before = await pool.query(
      `SELECT b.user_id, b.status AS prev_status, u.name, u.email, f.flight_number, f.origin, f.destination, f.departure_time
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN flights f ON f.id = b.flight_id
       WHERE b.id = $1`,
      [req.params.id],
    );
    if (!before.rows.length) {
      return res.status(404).json({ error: "Booking not found." });
    }

    const result = await pool.query(
      `UPDATE bookings
       SET status = $1
       WHERE id = $2
       RETURNING id, status`,
      [status, req.params.id],
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Booking not found." });
    }

    const prev = before.rows[0];
    if (status === "cancelled" && String(prev.prev_status) !== "cancelled") {
      try {
        const dep = new Date(prev.departure_time).toLocaleDateString();
        await createNotification(pool, {
          userId: prev.user_id,
          type: "booking_cancelled_admin",
          title: "Booking cancelled",
          message: `Your booking #${req.params.id} for ${prev.flight_number} (${prev.origin} → ${prev.destination}) on ${dep} was cancelled by an administrator.`,
          relatedBookingId: Number(req.params.id),
        });

        const mail = bookingCancelledByAdmin({
          passengerName: prev.name,
          bookingId: req.params.id,
          flightNumber: prev.flight_number,
          origin: prev.origin,
          destination: prev.destination,
          departureTime: prev.departure_time,
        });
        sendEmail(prev.email, mail.subject, mail.html).catch((e) =>
          console.error("admin booking cancellation email failed:", e.message),
        );
      } catch (notifyErr) {
        console.error("notify admin booking cancel:", notifyErr.message);
      }
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAdminUsers = async (_req, res) => {
  try {
    await ensureUserActiveColumn();
    const result = await pool.query(
      `SELECT id, name, email, role, wallet_balance, is_active
       FROM users
       ORDER BY created_at DESC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateAdminUserStatus = async (req, res) => {
  try {
    await ensureUserActiveColumn();
    const isActive = req.body.is_active;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "`is_active` must be boolean." });
    }

    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid user id." });
    }
    if (userId === Number(req.user.id)) {
      return res
        .status(400)
        .json({ error: "You cannot deactivate your own admin account." });
    }

    const current = await pool.query(
      `SELECT id, role, is_active FROM users WHERE id = $1`,
      [userId],
    );
    if (!current.rows.length) {
      return res.status(404).json({ error: "User not found." });
    }
    if (current.rows[0].role === "admin") {
      return res
        .status(400)
        .json({ error: "Admin accounts cannot be activated or deactivated." });
    }

    const result = await pool.query(
      `UPDATE users
       SET is_active = $1
       WHERE id = $2
       RETURNING id, name, email, role, wallet_balance, is_active`,
      [isActive, userId],
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const adjustUserWallet = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id." });
  }

  let delta = Number(req.body.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({
      error:
        "Body `delta` must be a non-zero number (negative = debit, positive = credit).",
    });
  }
  delta = roundMoney(delta);

  const typeRaw = String(req.body.type || "admin_adjustment").trim();
  const type = typeRaw.slice(0, 40) || "admin_adjustment";
  const description =
    req.body.description != null
      ? String(req.body.description).slice(0, 500)
      : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const beforeRow = await client.query(
      "SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    if (beforeRow.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "User not found." });
    }
    const balance_before = roundMoney(beforeRow.rows[0].wallet_balance);

    const { balance_after } = await applyWalletChange(client, {
      userId,
      delta,
      type,
      referenceId: null,
      description:
        description ||
        `Admin adjustment (${delta >= 0 ? "+" : ""}${delta} NPR)`,
    });

    await client.query("COMMIT");
    res.status(200).json({
      user_id: userId,
      delta,
      balance_before,
      balance_after,
      type,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "INSUFFICIENT_FUNDS") {
      return res.status(400).json({
        error: err.message,
        balance: err.balance,
        required: err.required,
      });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

const adminLogin = async (req, res) => {
  try {
    await ensureUserActiveColumn();
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND role = $2",
      [email, "admin"],
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }
    const admin = result.rows[0];
    if (admin.is_active === false) {
      return res.status(403).json({ error: "This account has been deactivated." });
    }
    const validPassword = await bcrypt.compare(password, admin.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }
    const token = jwt.sign(
      { id: admin.id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );
    const { password: _password, ...adminWithoutPassword } = admin;
    res.json({ user: adminWithoutPassword, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAdminMe,
  getAdminStats,
  getAdminAnalytics,
  getAdminAlertFlights,
  broadcastAdminAlert,
  getAdminDestinations,
  createAdminDestination,
  updateAdminDestination,
  deleteAdminDestination,
  getAdminFlights,
  createAdminFlight,
  updateAdminFlight,
  deleteAdminFlight,
  getAdminBookings,
  updateAdminBooking,
  getAdminUsers,
  updateAdminUserStatus,
  adjustUserWallet,
  adminLogin,
};
