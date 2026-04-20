const pool = require("../db/pool");
const { createNotification } = require("../utils/notificationHelper");
const { getSeatsByFlight } = require("../models/seatModel");
const { getSeatPriceFromBase } = require("../utils/seatPricing");
const { applyWalletChange, roundMoney } = require("../utils/walletLedger");
const { sendEmail } = require("../utils/sendEmail");
const { seatMovedToEmptySeat } = require("../utils/emailTemplates");

const RESERVATION_MINUTES = 5;

async function releaseExpiredReservations(clientOrPool = pool) {
  const result = await clientOrPool.query(
    `UPDATE seats
     SET status = 'available',
         reserved_until = NULL,
         reserved_by_user_id = NULL
     WHERE status = 'reserved'
       AND reserved_until IS NOT NULL
       AND reserved_until <= NOW()
     RETURNING id`,
  );
  return result.rowCount;
}

function mapSeatRow(row, options = {}) {
  const {
    viewerUserId = null,
    revealAllGenders = false,
    basePrice = 0,
  } = options;
  const booked = row.status === "booked";
  const userId =
    booked && row.booked_user_id != null ? row.booked_user_id : null;
  const seatPricing = getSeatPriceFromBase({
    basePrice,
    seatNumber: row.seat_number,
    seatClass: row.class,
  });
  let gender =
    booked && (row.booked_gender === "male" || row.booked_gender === "female")
      ? row.booked_gender
      : null;
  const hideFromOthers = row.booked_show_gender_on_map === false;
  const viewerId = viewerUserId != null ? Number(viewerUserId) : null;
  const ownerId = userId != null ? Number(userId) : null;
  const isOwner = viewerId != null && ownerId != null && viewerId === ownerId;
  if (gender && hideFromOthers && !isOwner && !revealAllGenders) {
    gender = null;
  }
  const acceptsPeerSwap =
    !booked ||
    row.booked_accept_peer_swap === null ||
    row.booked_accept_peer_swap === undefined
      ? true
      : row.booked_accept_peer_swap !== false;
  return {
    id: row.id,
    flight_id: row.flight_id,
    seat_number: row.seat_number,
    class: row.class,
    status: row.status,
    reserved_until: row.reserved_until,
    is_booked: booked,
    user_id: userId,
    price: seatPricing.price,
    currency: "NPR",
    price_breakdown: seatPricing.breakdownText,
    price_breakdown_items: seatPricing.breakdownItems,
    gender,
    accepts_peer_swap: acceptsPeerSwap,
    seatNumber: row.seat_number,
    isBooked: booked,
    seatPrice: seatPricing.price,
    seatPriceBreakdown: seatPricing.breakdownText,
    userId: userId != null ? String(userId) : null,
  };
}

async function listSeatsByFlight(flightId, options = {}) {
  await releaseExpiredReservations();
  const client = await pool.connect();
  try {
    const flightResult = await client.query(
      "SELECT price FROM flights WHERE id = $1",
      [flightId],
    );
    if (flightResult.rowCount === 0) {
      throw Object.assign(new Error("Flight not found."), { statusCode: 404 });
    }
    const rows = await getSeatsByFlight(client, flightId);
    const mapOpts = {
      viewerUserId:
        options.viewerUserId != null ? Number(options.viewerUserId) : null,
      revealAllGenders: options.revealAllGenders === true,
      basePrice: Number(flightResult.rows[0].price) || 0,
    };
    return rows.map((row) => mapSeatRow(row, mapOpts));
  } finally {
    client.release();
  }
}

async function lockSeats({ userId, seatIds }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await releaseExpiredReservations(client);

    const seatRows = await client.query(
      `SELECT id, flight_id, seat_number, status, reserved_until, reserved_by_user_id
       FROM seats
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [seatIds],
    );

    if (seatRows.rowCount !== seatIds.length) {
      throw Object.assign(
        new Error("One or more selected seats were not found."),
        { statusCode: 404 },
      );
    }

    for (const seat of seatRows.rows) {
      if (seat.status === "booked") {
        throw Object.assign(
          new Error(`Seat ${seat.seat_number} is already booked.`),
          { statusCode: 409 },
        );
      }
      if (seat.status === "reserved" && seat.reserved_by_user_id !== userId) {
        throw Object.assign(
          new Error(`Seat ${seat.seat_number} is reserved by another user.`),
          { statusCode: 409 },
        );
      }
    }

    const flights = new Set(seatRows.rows.map((s) => s.flight_id));
    if (flights.size > 1) {
      throw Object.assign(
        new Error("All selected seats must belong to the same flight."),
        { statusCode: 400 },
      );
    }

    const lockResult = await client.query(
      `UPDATE seats
       SET status = 'reserved',
           reserved_until = NOW() + INTERVAL '${RESERVATION_MINUTES} minutes',
           reserved_by_user_id = $2
       WHERE id = ANY($1::int[])
       RETURNING id, seat_number, flight_id, class, status, reserved_until`,
      [seatIds, userId],
    );

    await client.query("COMMIT");
    return lockResult.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function parseGenders(passengerGenders, count) {
  if (!Array.isArray(passengerGenders) || passengerGenders.length !== count) {
    return null;
  }
  const out = passengerGenders.map((g) => String(g).toLowerCase().trim());
  for (const g of out) {
    if (g !== "male" && g !== "female") return null;
  }
  return out;
}

function parseShowGenderFlags(passengerShowGenderOnMap, count) {
  if (passengerShowGenderOnMap == null) {
    return Array.from({ length: count }, () => true);
  }
  if (
    !Array.isArray(passengerShowGenderOnMap) ||
    passengerShowGenderOnMap.length !== count
  ) {
    return null;
  }
  return passengerShowGenderOnMap.map((v) => {
    if (v === false || v === 0 || v === "0") return false;
    const s = String(v).toLowerCase().trim();
    if (s === "false" || s === "no" || s === "off") return false;
    return true;
  });
}

function parseAcceptPeerSwapFlags(passengerAcceptPeerSwap, count) {
  if (passengerAcceptPeerSwap == null) {
    return Array.from({ length: count }, () => true);
  }
  if (
    !Array.isArray(passengerAcceptPeerSwap) ||
    passengerAcceptPeerSwap.length !== count
  ) {
    return null;
  }
  return passengerAcceptPeerSwap.map((v) => {
    if (v === false || v === 0 || v === "0") return false;
    const s = String(v).toLowerCase().trim();
    if (s === "false" || s === "no" || s === "off") return false;
    return true;
  });
}

async function confirmSeats({
  userId,
  bookingId,
  seatIds,
  passengerNames,
  passengerGenders,
  passengerShowGenderOnMap,
  passengerAcceptPeerSwap,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await releaseExpiredReservations(client);

    const bookingResult = await client.query(
      `SELECT id, user_id, flight_id, passengers
       FROM bookings
       WHERE id = $1
       FOR UPDATE`,
      [bookingId],
    );
    if (bookingResult.rowCount === 0) {
      throw Object.assign(new Error("Booking not found."), { statusCode: 404 });
    }
    const booking = bookingResult.rows[0];
    if (booking.user_id !== userId) {
      throw Object.assign(
        new Error("You can only confirm seats for your own booking."),
        { statusCode: 403 },
      );
    }

    if (!Array.isArray(seatIds) || seatIds.length !== booking.passengers) {
      throw Object.assign(
        new Error(`You must confirm exactly ${booking.passengers} seat(s).`),
        { statusCode: 400 },
      );
    }

    const seatRows = await client.query(
      `SELECT id, flight_id, seat_number, status, reserved_by_user_id
       FROM seats
       WHERE id = ANY($1::int[])
       FOR UPDATE`,
      [seatIds],
    );
    if (seatRows.rowCount !== seatIds.length) {
      throw Object.assign(
        new Error("One or more selected seats were not found."),
        { statusCode: 404 },
      );
    }
    for (const seat of seatRows.rows) {
      if (seat.flight_id !== booking.flight_id) {
        throw Object.assign(
          new Error(
            `Seat ${seat.seat_number} does not belong to this booking's flight.`,
          ),
          { statusCode: 400 },
        );
      }
      if (seat.status !== "reserved" || seat.reserved_by_user_id !== userId) {
        throw Object.assign(
          new Error(`Seat ${seat.seat_number} is not reserved by you.`),
          { statusCode: 409 },
        );
      }
    }

    const passengerList =
      Array.isArray(passengerNames) &&
      passengerNames.length === booking.passengers
        ? passengerNames
        : Array.from(
            { length: booking.passengers },
            (_, i) => `Passenger ${i + 1}`,
          );

    const genders = parseGenders(passengerGenders, booking.passengers);
    if (!genders) {
      throw Object.assign(
        new Error(
          `Provide passengerGenders with exactly ${booking.passengers} value(s), each "male" or "female".`,
        ),
        { statusCode: 400 },
      );
    }

    const showFlags = parseShowGenderFlags(
      passengerShowGenderOnMap,
      booking.passengers,
    );
    if (!showFlags) {
      throw Object.assign(
        new Error(
          `Provide passengerShowGenderOnMap with exactly ${booking.passengers} boolean value(s), or omit it to default all to true.`,
        ),
        { statusCode: 400 },
      );
    }

    const peerSwapFlags = parseAcceptPeerSwapFlags(
      passengerAcceptPeerSwap,
      booking.passengers,
    );
    if (!peerSwapFlags) {
      throw Object.assign(
        new Error(
          `Provide passengerAcceptPeerSwap with exactly ${booking.passengers} boolean value(s), or omit it to default all to true.`,
        ),
        { statusCode: 400 },
      );
    }

    await client.query(
      `UPDATE seats
       SET status = 'booked',
           reserved_until = NULL,
           reserved_by_user_id = NULL
       WHERE id = ANY($1::int[])`,
      [seatIds],
    );

    await client.query("DELETE FROM tickets WHERE booking_id = $1", [
      bookingId,
    ]);
    for (let i = 0; i < seatIds.length; i++) {
      await client.query(
        `INSERT INTO tickets (booking_id, seat_id, passenger_name, gender, show_gender_on_map, accept_peer_swap)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          bookingId,
          seatIds[i],
          passengerList[i] || `Passenger ${i + 1}`,
          genders[i],
          showFlags[i],
          peerSwapFlags[i],
        ],
      );
    }

    const result = await client.query(
      `SELECT t.id, t.booking_id, t.seat_id, t.passenger_name, t.gender, s.seat_number
       FROM tickets t
       JOIN seats s ON s.id = t.seat_id
       WHERE t.booking_id = $1
       ORDER BY t.id`,
      [bookingId],
    );

    await client.query("COMMIT");

    try {
      const dup = await pool.query(
        `SELECT 1 FROM notifications WHERE related_booking_id = $1 AND type = 'booking_confirmed' LIMIT 1`,
        [bookingId],
      );
      if (dup.rowCount === 0) {
        const fr = await pool.query(
          `SELECT f.flight_number, f.origin, f.destination, f.departure_time
           FROM flights f
           WHERE f.id = $1`,
          [booking.flight_id],
        );
        const flight = fr.rows[0];
        if (flight) {
          await createNotification(pool, {
            userId,
            type: "booking_confirmed",
            title: "Booking confirmed",
            message: `Your booking for ${flight.flight_number} (${flight.origin} → ${flight.destination}) on ${new Date(flight.departure_time).toLocaleDateString()} is confirmed.`,
            relatedBookingId: bookingId,
          });
        }
      }
    } catch (notifyErr) {
      console.error(
        "createNotification (booking_confirmed after seats):",
        notifyErr.message,
      );
    }

    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function swapSeat({ userId, bookingId, fromSeatId, toSeatId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await releaseExpiredReservations(client);

    const bookingResult = await client.query(
      "SELECT id, user_id, flight_id, total_price, passengers FROM bookings WHERE id = $1 FOR UPDATE",
      [bookingId],
    );
    if (bookingResult.rowCount === 0) {
      throw Object.assign(new Error("Booking not found."), { statusCode: 404 });
    }
    const booking = bookingResult.rows[0];
    if (booking.user_id !== userId) {
      throw Object.assign(
        new Error("You can only swap seats for your own booking."),
        { statusCode: 403 },
      );
    }

    const ticketResult = await client.query(
      "SELECT id FROM tickets WHERE booking_id = $1 AND seat_id = $2 FOR UPDATE",
      [bookingId, fromSeatId],
    );
    if (ticketResult.rowCount === 0) {
      throw Object.assign(
        new Error("Current seat is not assigned to this booking."),
        { statusCode: 400 },
      );
    }
    const ticketId = ticketResult.rows[0].id;

    const fromSeatResult = await client.query(
      "SELECT id, flight_id, seat_number, class FROM seats WHERE id = $1 FOR UPDATE",
      [fromSeatId],
    );
    const toSeatResult = await client.query(
      "SELECT id, flight_id, seat_number, class, status FROM seats WHERE id = $1 FOR UPDATE",
      [toSeatId],
    );
    if (fromSeatResult.rowCount === 0 || toSeatResult.rowCount === 0) {
      throw Object.assign(new Error("Seat not found."), { statusCode: 404 });
    }

    const fromSeat = fromSeatResult.rows[0];
    const toSeat = toSeatResult.rows[0];
    if (
      fromSeat.flight_id !== booking.flight_id ||
      toSeat.flight_id !== booking.flight_id
    ) {
      throw Object.assign(
        new Error("Seat swap is only allowed within the same flight."),
        { statusCode: 400 },
      );
    }
    if (toSeat.status !== "available") {
      throw Object.assign(
        new Error(`Seat ${toSeat.seat_number} is not available.`),
        { statusCode: 409 },
      );
    }
    if (
      String(fromSeat.class || "").toLowerCase() !==
      String(toSeat.class || "").toLowerCase()
    ) {
      throw Object.assign(
        new Error("Seat move is only allowed within the same cabin class."),
        { statusCode: 400 },
      );
    }

    const flightResult = await client.query(
      "SELECT id, price, flight_number, origin, destination, departure_time FROM flights WHERE id = $1",
      [booking.flight_id],
    );
    if (flightResult.rowCount === 0) {
      throw Object.assign(new Error("Flight not found."), { statusCode: 404 });
    }
    const flight = flightResult.rows[0];
    const fromPrice = Number(
      getSeatPriceFromBase({
        basePrice: flight.price,
        seatNumber: fromSeat.seat_number,
        seatClass: fromSeat.class,
      }).price,
    );
    const toPrice = Number(
      getSeatPriceFromBase({
        basePrice: flight.price,
        seatNumber: toSeat.seat_number,
        seatClass: toSeat.class,
      }).price,
    );
    const priceDelta = roundMoney(toPrice - fromPrice);
    const nextBookingTotal = roundMoney(
      Number(booking.total_price || 0) + priceDelta,
    );

    if (priceDelta !== 0) {
      await applyWalletChange(client, {
        userId,
        delta: roundMoney(-priceDelta),
        type: "seat_change_adjustment",
        referenceId: bookingId,
        description:
          priceDelta > 0
            ? `Seat upgrade adjustment for booking #${bookingId} (${fromSeat.seat_number} -> ${toSeat.seat_number})`
            : `Seat downgrade refund for booking #${bookingId} (${fromSeat.seat_number} -> ${toSeat.seat_number})`,
      });

      await client.query("UPDATE bookings SET total_price = $1 WHERE id = $2", [
        nextBookingTotal,
        bookingId,
      ]);
    }

    await client.query(
      `UPDATE seats SET status = 'available', reserved_until = NULL, reserved_by_user_id = NULL WHERE id = $1`,
      [fromSeatId],
    );
    await client.query(
      `UPDATE seats SET status = 'booked', reserved_until = NULL, reserved_by_user_id = NULL WHERE id = $1`,
      [toSeatId],
    );
    await client.query("UPDATE tickets SET seat_id = $1 WHERE id = $2", [
      toSeatId,
      ticketId,
    ]);

    await client.query("COMMIT");

    try {
      const route = `${flight.flight_number} (${flight.origin} → ${flight.destination})`;
      const adjustmentText =
        priceDelta > 0
          ? `You paid NPR ${Number(priceDelta).toLocaleString()} extra for this seat change.`
          : priceDelta < 0
            ? `You received NPR ${Number(Math.abs(priceDelta)).toLocaleString()} back for this seat change.`
            : "No fare change was needed.";
      await createNotification(pool, {
        userId,
        type: "seat_changed",
        title: "Seat updated",
        message: `Your seat on ${route} was moved from ${fromSeat.seat_number} to ${toSeat.seat_number}. ${adjustmentText}`,
        relatedBookingId: bookingId,
      });

      const userResult = await pool.query(
        "SELECT name, email FROM users WHERE id = $1",
        [userId],
      );
      const user = userResult.rows[0] || {};
      const boardingMail = seatMovedToEmptySeat({
        passengerName: user.name,
        bookingId,
        flightNumber: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        departureTime: flight.departure_time,
        boardingTime: new Date(
          new Date(flight.departure_time).getTime() - 20 * 60 * 1000,
        ),
        fromSeatNumber: fromSeat.seat_number,
        toSeatNumber: toSeat.seat_number,
        priceDelta,
        bookingTotal: nextBookingTotal,
        passengers: booking.passengers,
        seatClass: toSeat.class,
      });
      sendEmail(user.email, boardingMail.subject, boardingMail.html).catch(
        (e) => console.error("seat move email failed:", e.message),
      );
    } catch (notifyErr) {
      console.error("createNotification (seat_changed):", notifyErr.message);
    }

    return {
      booking_id: bookingId,
      from_seat_id: fromSeatId,
      from_seat_number: fromSeat.seat_number,
      to_seat_id: toSeatId,
      to_seat_number: toSeat.seat_number,
      price_delta: priceDelta,
      booking_total_price: nextBookingTotal,
      message:
        priceDelta > 0
          ? `Seat changed successfully. NPR ${Number(priceDelta).toLocaleString()} was charged.`
          : priceDelta < 0
            ? `Seat changed successfully. NPR ${Number(Math.abs(priceDelta)).toLocaleString()} was refunded.`
            : "Seat changed successfully. No fare difference.",
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listSeatsByFlight,
  lockSeats,
  confirmSeats,
  swapSeat,
  releaseExpiredReservations,
  RESERVATION_MINUTES,
};
