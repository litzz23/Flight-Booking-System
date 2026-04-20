const router = require("express").Router();
const pool = require("../db/pool");
const { authenticate, authorizeUser } = require("../middleware/auth");
const { getCancellationPreview } = require("../utils/cancellationPolicy");
const { applyWalletChange, roundMoney } = require("../utils/walletLedger");
const { createNotification } = require("../utils/notificationHelper");
const { sendEmail } = require("../utils/sendEmail");
const {
  boardingPass,
  bookingConfirmed,
  bookingCancelledByUser,
} = require("../utils/emailTemplates");
const {
  getSeatPriceFromBase,
  normalizeSeatClass,
} = require("../utils/seatPricing");
const {
  syncPastFlightsStatus,
  syncPastBookingsStatus,
} = require("../utils/flightStatus");
const {
  releaseExpiredReservations,
  RESERVATION_MINUTES,
} = require("../services/seatService");

function attachCancellation(row) {
  return {
    ...row,
    cancellation: getCancellationPreview({
      departure_time: row.departure_time,
      flight_status: row.flight_status,
      total_price: row.total_price,
      booking_status: row.status,
    }),
  };
}

function normalizePassengerDetails(body, paxCount) {
  const {
    passenger_details,
    passenger_name,
    passenger_email,
    passenger_phone,
  } = body;
  let list = passenger_details;

  if (Array.isArray(list) && list.length > 0) {
    if (list.length !== paxCount) return null;
    return list.map((p) => ({
      name: String(p.name || "").trim(),
      email: String(p.email || "").trim(),
      phone: String(p.phone || "").trim(),
      seat_class: p.seat_class ? String(p.seat_class).trim() : undefined,
      is_guest: p.is_guest === true,
    }));
  }

  if (passenger_name && passenger_email) {
    return [
      {
        name: String(passenger_name).trim(),
        email: String(passenger_email).trim(),
        phone: String(passenger_phone || "").trim(),
      },
    ];
  }

  return null;
}

function parseSeatIds(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  return Array.from(new Set(ids));
}

function validatePassengerDetails(details, paxCount) {
  if (!details || details.length !== paxCount) {
    return {
      ok: false,
      error: `Provide name, email, and phone for all ${paxCount} passenger(s).`,
    };
  }
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set();
  for (let i = 0; i < details.length; i++) {
    const p = details[i];
    if (!p.name || !p.email) {
      return {
        ok: false,
        error: `Passenger ${i + 1}: name and email are required.`,
      };
    }
    if (!p.phone) {
      return {
        ok: false,
        error: `Passenger ${i + 1}: mobile number is required.`,
      };
    }
    if (!emailRe.test(p.email)) {
      return {
        ok: false,
        error: `Passenger ${i + 1}: enter a valid email address.`,
      };
    }
    if (
      p.seat_class != null &&
      p.seat_class !== "" &&
      !["economy", "business"].includes(normalizeSeatClass(p.seat_class))
    ) {
      return {
        ok: false,
        error: `Passenger ${i + 1}: seat class must be Economy or Business.`,
      };
    }

    const key = `${String(p.name).trim().toLowerCase()}|${String(p.email).trim().toLowerCase()}`;
    if (seen.has(key)) {
      return {
        ok: false,
        error: `Passenger ${i + 1}: duplicate traveler details in this booking.`,
      };
    }
    seen.add(key);
  }
  return { ok: true };
}

function passengerIdentityKey(name, email) {
  return `${String(name || "")
    .trim()
    .toLowerCase()}|${String(email || "")
    .trim()
    .toLowerCase()}`;
}

function extractBookingPassengerKeys(booking) {
  const keys = new Set();
  const add = (name, email) => {
    const k = passengerIdentityKey(name, email);
    if (k !== "|") keys.add(k);
  };

  let details = booking?.passenger_details;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      details = null;
    }
  }

  if (Array.isArray(details) && details.length > 0) {
    details.forEach((p) => add(p?.name, p?.email));
  } else {
    add(booking?.passenger_name, booking?.passenger_email);
  }

  return keys;
}

function buildBoardingPassList(row) {
  let details = row.passenger_details;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      details = null;
    }
  }

  const travelers =
    Array.isArray(details) && details.length > 0
      ? details.map((p) => ({
          name: String(p.name || "").trim(),
          email: String(p.email || "").trim(),
          seat_class: p.seat_class,
          seat_number: p.seat_number,
        }))
      : [
          {
            name: String(row.passenger_name || "").trim(),
            email: String(row.passenger_email || "").trim(),
            seat_class: row.seat_class,
            seat_number: undefined,
          },
        ];

  const assignments = Array.isArray(row.seat_assignments)
    ? row.seat_assignments
    : [];
  const ticketByPassengerName = new Map();
  for (const a of assignments) {
    const k = String(a.passenger_name || "")
      .trim()
      .toLowerCase();
    if (k) ticketByPassengerName.set(k, a);
  }

  const boardingIso = new Date(
    new Date(row.departure_time).getTime() - 20 * 60 * 1000,
  ).toISOString();

  return travelers.map((p, i) => {
    const key = p.name.toLowerCase();
    const ticket =
      ticketByPassengerName.get(key) ||
      (assignments.length === travelers.length ? assignments[i] : null);
    const seatNumber =
      p.seat_number != null && String(p.seat_number).trim() !== ""
        ? p.seat_number
        : ticket?.seat_number ?? null;
    const seatClass =
      p.seat_class != null && String(p.seat_class).trim() !== ""
        ? String(p.seat_class).trim()
        : row.seat_class;

    return {
      passenger_name: p.name || row.passenger_name,
      passenger_email: p.email || row.passenger_email,
      seat_number: seatNumber,
      seat_class: seatClass,
      flight_number: row.flight_number,
      airline: row.airline,
      origin: row.origin,
      destination: row.destination,
      departure_time: row.departure_time,
      boarding_time: boardingIso,
      booking_id: row.id,
      booking_total_npr: Number(row.total_price),
      passengers_on_booking: row.passengers,
      ticket_id: ticket?.ticket_id ?? null,
      seat_id: ticket?.seat_id ?? null,
    };
  });
}

router.post("/", authenticate, authorizeUser, async (req, res) => {
  const { flight_id, passengers, seat_class } = req.body;

  if (!flight_id) {
    return res.status(400).json({ error: "flight_id is required." });
  }

  const paxCount = passengers || 1;
  const seatIds = parseSeatIds(req.body.seatIds ?? req.body.seat_ids);

  if (paxCount > 5) {
    return res
      .status(400)
      .json({ error: "Maximum 5 passengers are allowed per booking." });
  }

  if (seatIds.length !== paxCount) {
    return res.status(400).json({
      error: `Provide exactly ${paxCount} seatIds for this booking.`,
    });
  }

  const details = normalizePassengerDetails(req.body, paxCount);
  const check = validatePassengerDetails(details, paxCount);
  if (!check.ok) {
    return res.status(400).json({ error: check.error });
  }

  const primary = details[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await releaseExpiredReservations(client);
    await syncPastFlightsStatus(client);
    await syncPastBookingsStatus(client);

    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [
      req.user.id,
    ]);

    const flightResult = await client.query(
      "SELECT * FROM flights WHERE id = $1 FOR UPDATE",
      [flight_id],
    );
    if (flightResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Flight not found." });
    }

    const flight = flightResult.rows[0];

    if (flight.status !== "scheduled") {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: `Flight is ${flight.status}, cannot book.` });
    }

    if (flight.available_seats < paxCount) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: `Only ${flight.available_seats} seats available.` });
    }

    const existingBookingsResult = await client.query(
      `SELECT passenger_name, passenger_email, passenger_details
       FROM bookings
       WHERE user_id = $1
         AND flight_id = $2
         AND status != 'cancelled'`,
      [req.user.id, flight_id],
    );

    const existingPassengerKeys = new Set();
    existingBookingsResult.rows.forEach((b) => {
      extractBookingPassengerKeys(b).forEach((k) =>
        existingPassengerKeys.add(k),
      );
    });

    for (let i = 0; i < details.length; i++) {
      const p = details[i];
      const key = passengerIdentityKey(p.name, p.email);
      if (existingPassengerKeys.has(key)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Passenger ${i + 1} is already booked on this flight. Please add another passenger.`,
        });
      }
    }

    const seatResult = await client.query(
      `SELECT id, flight_id, seat_number, class, status, reserved_by_user_id
       FROM seats
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [seatIds],
    );

    if (seatResult.rowCount !== seatIds.length) {
      await client.query("ROLLBACK");
      return res
        .status(404)
        .json({ error: "One or more selected seats were not found." });
    }

    for (const seat of seatResult.rows) {
      if (Number(seat.flight_id) !== Number(flight_id)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Seat ${seat.seat_number} does not belong to this flight.`,
        });
      }
      if (seat.status === "booked") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Seat ${seat.seat_number} is already booked.`,
        });
      }
      if (seat.status === "reserved") {
        if (Number(seat.reserved_by_user_id) !== Number(req.user.id)) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: `Seat ${seat.seat_number} is reserved by another user.`,
          });
        }
      } else if (seat.status !== "available") {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Seat ${seat.seat_number} is not available for booking.`,
        });
      }
    }

    const availableSeatIds = seatResult.rows
      .filter((s) => s.status === "available")
      .map((s) => Number(s.id));
    if (availableSeatIds.length > 0) {
      const claimResult = await client.query(
        `UPDATE seats
         SET status = 'reserved',
             reserved_until = NOW() + INTERVAL '${RESERVATION_MINUTES} minutes',
             reserved_by_user_id = $2
         WHERE id = ANY($1::int[]) AND status = 'available'
         RETURNING id`,
        [availableSeatIds, req.user.id],
      );
      if (claimResult.rowCount !== availableSeatIds.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error:
            "One or more seats were taken by another booking. Please reselect seats.",
        });
      }
    }

    const seatById = new Map(
      seatResult.rows.map((seat) => [Number(seat.id), seat]),
    );
    const orderedSeats = seatIds
      .map((id) => seatById.get(Number(id)))
      .filter(Boolean);
    if (orderedSeats.length !== paxCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Seat assignment data is invalid. Please reselect seats.",
      });
    }

    for (let i = 0; i < paxCount; i++) {
      const passenger = details[i] || {};
      const seat = orderedSeats[i];
      if (passenger.seat_class) {
        const wanted = normalizeSeatClass(passenger.seat_class);
        const actual = normalizeSeatClass(seat.class);
        if (wanted !== actual) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `Passenger ${i + 1}: selected seat ${seat.seat_number} is ${actual === "business" ? "Business" : "Economy"}, but traveler class is ${wanted === "business" ? "Business" : "Economy"}.`,
          });
        }
      }
      details[i] = {
        ...passenger,
        seat_class:
          normalizeSeatClass(seat.class) === "business"
            ? "Business"
            : "Economy",
        seat_number: seat.seat_number,
      };
    }

    const classSet = new Set(
      orderedSeats.map((seat) => normalizeSeatClass(seat.class)),
    );
    let inferredSeatClass = "Mixed";
    if (classSet.size === 1) {
      inferredSeatClass = classSet.has("business") ? "Business" : "Economy";
    }

    if (
      seat_class &&
      String(seat_class).trim().toLowerCase() !==
        inferredSeatClass.toLowerCase()
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: `Selected seats are ${inferredSeatClass}. Update class selection and try again.`,
      });
    }

    const pricedSeats = orderedSeats.map((seat) => ({
      id: seat.id,
      seat_number: seat.seat_number,
      ...getSeatPriceFromBase({
        basePrice: flight.price,
        seatNumber: seat.seat_number,
        seatClass: seat.class,
      }),
    }));

    const totalPrice = roundMoney(
      pricedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0),
    );

    const bookingResult = await client.query(
      `INSERT INTO bookings (user_id, flight_id, passengers, total_price, passenger_name, passenger_email, passenger_phone, seat_class, passenger_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        req.user.id,
        flight_id,
        paxCount,
        totalPrice,
        primary.name,
        primary.email,
        primary.phone,
        inferredSeatClass,
        JSON.stringify(details),
      ],
    );

    const booking = bookingResult.rows[0];

    await applyWalletChange(client, {
      userId: req.user.id,
      delta: -totalPrice,
      type: "booking_payment",
      referenceId: booking.id,
      description: `Flight booking #${booking.id} · ${flight.flight_number} ${flight.origin} → ${flight.destination}`,
    });

    await client.query(
      "UPDATE flights SET available_seats = available_seats - $1 WHERE id = $2",
      [paxCount, flight_id],
    );

    await client.query("COMMIT");

    try {
      await createNotification(pool, {
        userId: req.user.id,
        type: "booking_confirmed",
        title: "Booking confirmed",
        message: `Your booking for ${flight.flight_number} (${flight.origin} → ${flight.destination}) on ${new Date(flight.departure_time).toLocaleDateString()} is confirmed.`,
        relatedBookingId: booking.id,
      });

      const mail = bookingConfirmed({
        passengerName: primary.name,
        bookingId: booking.id,
        flightNumber: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        departureTime: flight.departure_time,
        totalPrice,
      });
      sendEmail(primary.email, mail.subject, mail.html).catch((e) =>
        console.error("booking confirmation email failed:", e.message),
      );

      const boardingTime = new Date(
        new Date(flight.departure_time).getTime() - 20 * 60 * 1000,
      );
      for (const passenger of details) {
        if (!passenger.email) continue;
        const boardingMail = boardingPass({
          passengerName: passenger.name,
          bookingId: booking.id,
          flightNumber: flight.flight_number,
          origin: flight.origin,
          destination: flight.destination,
          departureTime: flight.departure_time,
          boardingTime,
          seatNumber: passenger.seat_number,
          seatClass: passenger.seat_class,
          passengers: paxCount,
          totalPrice,
        });
        sendEmail(
          passenger.email,
          boardingMail.subject,
          boardingMail.html,
        ).catch((e) => console.error("boarding pass email failed:", e.message));
      }
    } catch (notifyErr) {
      console.error(
        "createNotification (booking_confirmed):",
        notifyErr.message,
      );
    }

    res.status(201).json(booking);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "INSUFFICIENT_FUNDS") {
      return res.status(402).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/", authenticate, authorizeUser, async (req, res) => {
  try {
    await syncPastFlightsStatus(pool);
    await syncPastBookingsStatus(pool);
    const result = await pool.query(
      `SELECT b.*, f.flight_number, f.airline, f.origin, f.destination, f.departure_time, f.arrival_time, f.status AS flight_status,
        COALESCE((
          SELECT json_agg(json_build_object(
            'ticket_id', t.id,
            'seat_id', s.id,
            'seat_number', s.seat_number,
            'passenger_name', t.passenger_name,
            'gender', t.gender,
            'show_gender_on_map', COALESCE(t.show_gender_on_map, true),
            'accept_peer_swap', COALESCE(t.accept_peer_swap, true)
          ) ORDER BY t.id)
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = b.id
        ), '[]'::json) AS seat_assignments
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.user_id = $1
       ORDER BY b.created_at DESC`,
      [req.user.id],
    );
    res.json(result.rows.map(attachCancellation));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get(
  "/:id/alternatives",
  authenticate,
  authorizeUser,
  async (req, res) => {
    try {
      await syncPastFlightsStatus(pool);
      await syncPastBookingsStatus(pool);
      const bookingResult = await pool.query(
        `SELECT b.id, b.passengers, b.flight_id,
              f.flight_number, f.origin, f.destination, f.departure_time, f.status AS flight_status
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.id = $1 AND b.user_id = $2`,
        [req.params.id, req.user.id],
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: "Booking not found." });
      }

      const row = bookingResult.rows[0];

      if (row.flight_status !== "cancelled") {
        return res.status(400).json({
          error:
            "Flight is not cancelled. Alternatives are only available for cancelled flights.",
        });
      }

      const altResult = await pool.query(
        `SELECT * FROM flights
       WHERE origin = $1
       AND destination = $2
       AND status = 'scheduled'
       AND available_seats >= $3
       AND departure_time > NOW()
       AND id != $5
       AND (
         (departure_time >= ($4::timestamptz - INTERVAL '3 days')
           AND departure_time <= ($4::timestamptz + INTERVAL '3 days'))
         OR ($4::timestamptz < NOW()
           AND departure_time <= NOW() + INTERVAL '14 days')
       )
       ORDER BY price ASC
       LIMIT 3`,
        [
          row.origin,
          row.destination,
          row.passengers,
          row.departure_time,
          row.flight_id,
        ],
      );

      res.json({
        cancelled_flight: {
          flight_number: row.flight_number,
          origin: row.origin,
          destination: row.destination,
          departure_time: row.departure_time,
        },
        alternatives: altResult.rows,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/cancellation-preview",
  authenticate,
  authorizeUser,
  async (req, res) => {
    try {
      await syncPastFlightsStatus(pool);
      await syncPastBookingsStatus(pool);
      const result = await pool.query(
        `SELECT b.status, b.total_price, f.departure_time, f.status AS flight_status
         FROM bookings b
         JOIN flights f ON b.flight_id = f.id
         WHERE b.id = $1 AND b.user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Booking not found." });
      }
      const row = result.rows[0];
      const cancellation = getCancellationPreview({
        departure_time: row.departure_time,
        flight_status: row.flight_status,
        total_price: row.total_price,
        booking_status: row.status,
      });
      res.json({ cancellation });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get(
  "/:id/boarding-pass",
  authenticate,
  authorizeUser,
  async (req, res) => {
    try {
      await syncPastFlightsStatus(pool);
      await syncPastBookingsStatus(pool);
      const result = await pool.query(
        `SELECT b.*, f.flight_number, f.airline, f.origin, f.destination, f.departure_time,
        COALESCE((
          SELECT json_agg(json_build_object(
            'ticket_id', t.id,
            'seat_id', s.id,
            'seat_number', s.seat_number,
            'passenger_name', t.passenger_name,
            'gender', t.gender,
            'show_gender_on_map', COALESCE(t.show_gender_on_map, true),
            'accept_peer_swap', COALESCE(t.accept_peer_swap, true)
          ) ORDER BY t.id)
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = b.id
        ), '[]'::json) AS seat_assignments
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.id = $1 AND b.user_id = $2`,
        [req.params.id, req.user.id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Booking not found." });
      }
      const row = result.rows[0];
      if (row.status === "cancelled") {
        return res.status(400).json({ error: "Booking is cancelled." });
      }
      const boarding_passes = buildBoardingPassList(row);
      res.json({
        booking_id: row.id,
        flight_number: row.flight_number,
        booking_status: row.status,
        boarding_passes,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get("/:id", authenticate, authorizeUser, async (req, res) => {
  try {
    await syncPastFlightsStatus(pool);
    await syncPastBookingsStatus(pool);
    const result = await pool.query(
      `SELECT b.*, f.flight_number, f.airline, f.origin, f.destination, f.departure_time, f.arrival_time, f.status AS flight_status,
        COALESCE((
          SELECT json_agg(json_build_object(
            'ticket_id', t.id,
            'seat_id', s.id,
            'seat_number', s.seat_number,
            'passenger_name', t.passenger_name,
            'gender', t.gender,
            'show_gender_on_map', COALESCE(t.show_gender_on_map, true),
            'accept_peer_swap', COALESCE(t.accept_peer_swap, true)
          ) ORDER BY t.id)
          FROM tickets t
          JOIN seats s ON s.id = t.seat_id
          WHERE t.booking_id = b.id
        ), '[]'::json) AS seat_assignments
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [req.params.id, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Booking not found." });
    }
    res.json(attachCancellation(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/cancel", authenticate, authorizeUser, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await syncPastFlightsStatus(client);
    await syncPastBookingsStatus(client);

    const bookingResult = await client.query(
      `SELECT b.*, f.flight_number, f.origin, f.destination, f.departure_time, f.status AS flight_status
       FROM bookings b
       JOIN flights f ON b.flight_id = f.id
       WHERE b.id = $1 AND b.user_id = $2
       FOR UPDATE`,
      [req.params.id, req.user.id],
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Booking not found." });
    }

    const booking = bookingResult.rows[0];

    const preview = getCancellationPreview({
      departure_time: booking.departure_time,
      flight_status: booking.flight_status,
      total_price: booking.total_price,
      booking_status: booking.status,
    });

    if (!preview.allowed) {
      await client.query("ROLLBACK");
      return res
        .status(400)
        .json({ error: preview.reason, code: preview.code });
    }

    await client.query(
      "UPDATE bookings SET status = 'cancelled' WHERE id = $1",
      [req.params.id],
    );

    const seatResult = await client.query(
      `SELECT t.seat_id
       FROM tickets t
       WHERE t.booking_id = $1`,
      [req.params.id],
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
    await client.query("DELETE FROM tickets WHERE booking_id = $1", [
      req.params.id,
    ]);

    await client.query(
      "UPDATE flights SET available_seats = available_seats + $1 WHERE id = $2",
      [booking.passengers, booking.flight_id],
    );

    const refund = roundMoney(preview.refund_amount || 0);
    if (refund > 0) {
      await applyWalletChange(client, {
        userId: req.user.id,
        delta: refund,
        type: "refund",
        referenceId: booking.id,
        description: `Refund for cancelled booking #${booking.id} (${preview.policy_label})`,
      });
    }

    await client.query("COMMIT");

    const refundDisplay = Number(refund).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
    try {
      await createNotification(pool, {
        userId: req.user.id,
        type: "booking_cancelled",
        title: "Booking cancelled",
        message: `Booking #${req.params.id} cancelled. NPR ${refundDisplay} refunded to your wallet.`,
        relatedBookingId: Number(req.params.id),
      });

      const mail = bookingCancelledByUser({
        passengerName: booking.passenger_name,
        bookingId: booking.id,
        flightNumber: booking.flight_number,
        origin: booking.origin,
        destination: booking.destination,
        departureTime: booking.departure_time,
        refundAmount: refund,
        policyLabel: preview.policy_label,
      });
      sendEmail(booking.passenger_email, mail.subject, mail.html).catch((e) =>
        console.error("booking cancellation email failed:", e.message),
      );
    } catch (notifyErr) {
      console.error(
        "createNotification (booking_cancelled):",
        notifyErr.message,
      );
    }

    res.json({
      message: "Booking cancelled successfully. Your seats have been released.",
      refund_amount: preview.refund_amount,
      fee_amount: preview.fee_amount,
      policy_label: preview.policy_label,
      wallet_credit: refund,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
