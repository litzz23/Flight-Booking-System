const pool = require("../db/pool");
const { releaseExpiredReservations } = require("./seatService");
const { createNotification } = require("../utils/notificationHelper");
const { getSeatPriceFromBase } = require("../utils/seatPricing");
const { applyWalletChange, roundMoney } = require("../utils/walletLedger");
const { sendEmail } = require("../utils/sendEmail");
const {
  swapRequested,
  swapAccepted,
  swapDeclined,
  seatMovedToEmptySeat,
} = require("../utils/emailTemplates");

async function getTicketForSeat(client, seatId) {
  const r = await client.query(
    `SELECT t.id AS ticket_id, t.booking_id, t.passenger_name, t.gender,
            COALESCE(t.accept_peer_swap, true) AS accept_peer_swap,
            b.user_id, b.flight_id, b.status AS booking_status
     FROM tickets t
     JOIN bookings b ON b.id = t.booking_id
     WHERE t.seat_id = $1`,
    [seatId],
  );
  return r.rows[0] || null;
}

async function createSwapRequest({
  requesterUserId,
  flightId,
  requesterSeatId,
  targetSeatId,
}) {
  if (requesterSeatId === targetSeatId) {
    throw Object.assign(new Error("You cannot swap a seat with itself."), {
      statusCode: 400,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await releaseExpiredReservations(client);

    const seatRows = await client.query(
      `SELECT id, flight_id, seat_number, class, status FROM seats WHERE id IN ($1, $2) FOR UPDATE`,
      [requesterSeatId, targetSeatId],
    );
    if (seatRows.rowCount !== 2) {
      throw Object.assign(new Error("One or both seats were not found."), {
        statusCode: 404,
      });
    }
    const byId = Object.fromEntries(seatRows.rows.map((s) => [s.id, s]));
    const reqSeat = byId[requesterSeatId];
    const tgtSeat = byId[targetSeatId];
    if (reqSeat.flight_id !== flightId || tgtSeat.flight_id !== flightId) {
      throw Object.assign(
        new Error("Both seats must belong to the specified flight."),
        { statusCode: 400 },
      );
    }
    if (reqSeat.status !== "booked" || tgtSeat.status !== "booked") {
      throw Object.assign(
        new Error("Both seats must be booked to request a swap."),
        { statusCode: 400 },
      );
    }
    if (
      String(reqSeat.class || "").toLowerCase() !==
      String(tgtSeat.class || "").toLowerCase()
    ) {
      throw Object.assign(
        new Error("Seat swap is only allowed within the same cabin class."),
        { statusCode: 400 },
      );
    }

    const reqTicket = await getTicketForSeat(client, requesterSeatId);
    const tgtTicket = await getTicketForSeat(client, targetSeatId);
    if (!reqTicket || !tgtTicket) {
      throw Object.assign(new Error("Could not resolve seat assignments."), {
        statusCode: 400,
      });
    }
    if (
      reqTicket.booking_status !== "confirmed" ||
      tgtTicket.booking_status !== "confirmed"
    ) {
      throw Object.assign(new Error("Both bookings must be confirmed."), {
        statusCode: 400,
      });
    }
    if (reqTicket.user_id !== requesterUserId) {
      throw Object.assign(
        new Error("You can only offer a seat that belongs to your booking."),
        { statusCode: 403 },
      );
    }
    if (tgtTicket.user_id === requesterUserId) {
      throw Object.assign(
        new Error("Cannot request a swap with your own seat."),
        { statusCode: 400 },
      );
    }

    if (tgtTicket.accept_peer_swap === false) {
      throw Object.assign(
        new Error(
          "That passenger has chosen not to receive seat swap requests.",
        ),
        { statusCode: 403 },
      );
    }

    if (!reqTicket.gender || !tgtTicket.gender) {
      throw Object.assign(
        new Error("Seat assignment is missing gender data."),
        { statusCode: 400 },
      );
    }

    const requesterGender = reqTicket.gender;
    const targetGender = tgtTicket.gender;

    const ins = await client.query(
      `INSERT INTO seat_swap_requests (
         flight_id, requester_user_id, requester_seat, target_user_id, target_seat,
         requester_gender, target_gender, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, flight_id, requester_user_id, requester_seat, target_user_id, target_seat,
                 requester_gender, target_gender, status, created_at`,
      [
        flightId,
        requesterUserId,
        requesterSeatId,
        tgtTicket.user_id,
        targetSeatId,
        requesterGender,
        targetGender,
      ],
    );

    await client.query("COMMIT");

    const swapRow = ins.rows[0];
    try {
      const [requesterInfo, targetInfo, flightInfo] = await Promise.all([
        pool.query("SELECT name FROM users WHERE id = $1", [requesterUserId]),
        pool.query("SELECT name, email FROM users WHERE id = $1", [
          swapRow.target_user_id,
        ]),
        pool.query(
          "SELECT flight_number, origin, destination FROM flights WHERE id = $1",
          [flightId],
        ),
      ]);
      const name = requesterInfo.rows[0]?.name || "A passenger";
      const target = targetInfo.rows[0] || {};
      const f = flightInfo.rows[0];
      const route = f
        ? `${f.flight_number} (${f.origin} → ${f.destination})`
        : "a flight";
      await createNotification(pool, {
        userId: swapRow.target_user_id,
        type: "seat_swap_request",
        title: "Seat swap request",
        message: `${name} wants to swap seats with you on ${route}. Open My Bookings to respond.`,
        relatedBookingId: tgtTicket.booking_id,
      });

      const mail = swapRequested({
        targetName: target.name,
        requesterName: name,
        flightNumber: f?.flight_number,
        origin: f?.origin,
        destination: f?.destination,
      });
      sendEmail(target.email, mail.subject, mail.html).catch((e) =>
        console.error("seat swap request email failed:", e.message),
      );
    } catch (notifyErr) {
      console.error(
        "createNotification (seat_swap_request):",
        notifyErr.message,
      );
    }

    return swapRow;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      throw Object.assign(
        new Error("A pending swap already involves one of these seats."),
        { statusCode: 409 },
      );
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listPendingForUser(userId) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.flight_id,
       r.requester_user_id,
       r.requester_seat,
       r.target_user_id,
       r.target_seat,
       r.status,
       r.created_at,
       f.flight_number,
       f.airline,
       f.origin,
       f.destination,
       f.departure_time,
       su.name AS requester_name,
       su.email AS requester_email,
       rs.seat_number AS requester_seat_number,
       ts.seat_number AS target_seat_number,
       CASE
         WHEN COALESCE(rt.show_gender_on_map, true) IS NOT TRUE THEN NULL
         ELSE r.requester_gender
       END AS requester_gender,
       r.target_gender
     FROM seat_swap_requests r
     JOIN flights f ON f.id = r.flight_id
     JOIN users su ON su.id = r.requester_user_id
     JOIN seats rs ON rs.id = r.requester_seat
     JOIN seats ts ON ts.id = r.target_seat
     LEFT JOIN tickets rt ON rt.seat_id = r.requester_seat
     WHERE r.target_user_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return result.rows;
}

async function acceptSwapRequest(requestId, userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await releaseExpiredReservations(client);

    const reqResult = await client.query(
      `SELECT * FROM seat_swap_requests WHERE id = $1 FOR UPDATE`,
      [requestId],
    );
    if (reqResult.rowCount === 0) {
      throw Object.assign(new Error("Swap request not found."), {
        statusCode: 404,
      });
    }
    const req = reqResult.rows[0];
    if (req.status !== "pending") {
      throw Object.assign(
        new Error("This swap request is no longer pending."),
        { statusCode: 409 },
      );
    }
    if (req.target_user_id !== userId) {
      throw Object.assign(
        new Error("You can only accept requests addressed to you."),
        { statusCode: 403 },
      );
    }

    const seatA = req.requester_seat;
    const seatB = req.target_seat;

    const seatsCheck = await client.query(
      `SELECT id, flight_id, seat_number, class, status FROM seats WHERE id IN ($1, $2) FOR UPDATE`,
      [seatA, seatB],
    );
    if (seatsCheck.rowCount !== 2) {
      throw Object.assign(new Error("Seats no longer exist."), {
        statusCode: 400,
      });
    }
    for (const s of seatsCheck.rows) {
      if (s.flight_id !== req.flight_id || s.status !== "booked") {
        throw Object.assign(
          new Error("Seats are no longer available for swap."),
          { statusCode: 409 },
        );
      }
    }

    const tA = await getTicketForSeat(client, seatA);
    const tB = await getTicketForSeat(client, seatB);
    if (!tA || !tB) {
      throw Object.assign(new Error("Ticket data missing for swap."), {
        statusCode: 400,
      });
    }
    if (
      tA.user_id !== req.requester_user_id ||
      tB.user_id !== req.target_user_id
    ) {
      throw Object.assign(
        new Error("Seat ownership no longer matches this request."),
        { statusCode: 409 },
      );
    }
    if (tA.flight_id !== req.flight_id || tB.flight_id !== req.flight_id) {
      throw Object.assign(new Error("Flight mismatch."), { statusCode: 400 });
    }

    const seatById = Object.fromEntries(seatsCheck.rows.map((s) => [s.id, s]));
    const seatRowA = seatById[seatA];
    const seatRowB = seatById[seatB];
    if (
      String(seatRowA.class || "").toLowerCase() !==
      String(seatRowB.class || "").toLowerCase()
    ) {
      throw Object.assign(
        new Error("Seat swap is only allowed within the same cabin class."),
        { statusCode: 400 },
      );
    }

    const flightResult = await client.query(
      "SELECT id, price, flight_number, origin, destination, departure_time FROM flights WHERE id = $1",
      [req.flight_id],
    );
    if (flightResult.rowCount === 0) {
      throw Object.assign(new Error("Flight not found."), { statusCode: 404 });
    }
    const flight = flightResult.rows[0];

    const seatPriceA = Number(
      getSeatPriceFromBase({
        basePrice: flight.price,
        seatNumber: seatRowA.seat_number,
        seatClass: seatRowA.class,
      }).price,
    );
    const seatPriceB = Number(
      getSeatPriceFromBase({
        basePrice: flight.price,
        seatNumber: seatRowB.seat_number,
        seatClass: seatRowB.class,
      }).price,
    );

    const requesterDelta = roundMoney(seatPriceB - seatPriceA);
    const targetDelta = roundMoney(seatPriceA - seatPriceB);

    const bookingsResult = await client.query(
      `SELECT id, user_id, total_price, passengers
       FROM bookings
       WHERE id IN ($1, $2)
       FOR UPDATE`,
      [tA.booking_id, tB.booking_id],
    );
    if (bookingsResult.rowCount !== 2) {
      throw Object.assign(new Error("Booking data missing for swap."), {
        statusCode: 400,
      });
    }
    const bookingById = Object.fromEntries(
      bookingsResult.rows.map((b) => [b.id, b]),
    );

    const requesterBooking = bookingById[tA.booking_id];
    const targetBooking = bookingById[tB.booking_id];

    if (requesterDelta !== 0) {
      await applyWalletChange(client, {
        userId: requesterBooking.user_id,
        delta: roundMoney(-requesterDelta),
        type: "seat_swap_adjustment",
        referenceId: requesterBooking.id,
        description:
          requesterDelta > 0
            ? `Seat swap upgrade adjustment for booking #${requesterBooking.id}`
            : `Seat swap downgrade refund for booking #${requesterBooking.id}`,
      });
      await client.query("UPDATE bookings SET total_price = $1 WHERE id = $2", [
        roundMoney(Number(requesterBooking.total_price || 0) + requesterDelta),
        requesterBooking.id,
      ]);
    }

    if (targetDelta !== 0) {
      await applyWalletChange(client, {
        userId: targetBooking.user_id,
        delta: roundMoney(-targetDelta),
        type: "seat_swap_adjustment",
        referenceId: targetBooking.id,
        description:
          targetDelta > 0
            ? `Seat swap upgrade adjustment for booking #${targetBooking.id}`
            : `Seat swap downgrade refund for booking #${targetBooking.id}`,
      });
      await client.query("UPDATE bookings SET total_price = $1 WHERE id = $2", [
        roundMoney(Number(targetBooking.total_price || 0) + targetDelta),
        targetBooking.id,
      ]);
    }

    await client.query(`UPDATE tickets SET seat_id = $1 WHERE id = $2`, [
      seatB,
      tA.ticket_id,
    ]);
    await client.query(`UPDATE tickets SET seat_id = $1 WHERE id = $2`, [
      seatA,
      tB.ticket_id,
    ]);

    await client.query(
      `UPDATE seat_swap_requests SET status = 'accepted' WHERE id = $1`,
      [requestId],
    );

    await client.query("COMMIT");

    try {
      const [accepter, requester] = await Promise.all([
        pool.query("SELECT name, email FROM users WHERE id = $1", [userId]),
        pool.query("SELECT name, email FROM users WHERE id = $1", [
          req.requester_user_id,
        ]),
      ]);
      const route = `${flight.flight_number} (${flight.origin} → ${flight.destination})`;
      const who = accepter.rows[0]?.name || "The other passenger";
      const requesterInfo = requester.rows[0] || {};
      const accepterInfo = accepter.rows[0] || {};
      const requesterAdjustmentText =
        requesterDelta > 0
          ? `NPR ${Number(requesterDelta).toLocaleString()} was charged to your wallet.`
          : requesterDelta < 0
            ? `NPR ${Number(Math.abs(requesterDelta)).toLocaleString()} was refunded to your wallet.`
            : "No fare difference was applied.";
      await createNotification(pool, {
        userId: req.requester_user_id,
        type: "seat_swap_accepted",
        title: "Seat swap accepted",
        message: `${who} accepted your seat swap request on ${route}. Your seats have been updated. ${requesterAdjustmentText}`,
        relatedBookingId: null,
      });

      const mail = swapAccepted({
        requesterName: requesterInfo.name,
        targetName: who,
        flightNumber: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        requesterDelta,
      });
      sendEmail(requesterInfo.email, mail.subject, mail.html).catch((e) =>
        console.error("seat swap accepted email failed:", e.message),
      );

      const boardingTime = new Date(
        new Date(flight.departure_time).getTime() - 20 * 60 * 1000,
      );
      const requesterBookingTotal = roundMoney(
        Number(requesterBooking.total_price || 0) + requesterDelta,
      );
      const targetBookingTotal = roundMoney(
        Number(targetBooking.total_price || 0) + targetDelta,
      );

      const requesterBoarding = seatMovedToEmptySeat({
        passengerName: requesterInfo.name,
        bookingId: tA.booking_id,
        flightNumber: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        departureTime: flight.departure_time,
        boardingTime,
        fromSeatNumber: seatRowA.seat_number,
        toSeatNumber: seatRowB.seat_number,
        priceDelta: requesterDelta,
        bookingTotal: requesterBookingTotal,
        passengers: requesterBooking.passengers,
        seatClass: seatRowB.class,
      });
      sendEmail(
        requesterInfo.email,
        requesterBoarding.subject,
        requesterBoarding.html,
      ).catch((e) =>
        console.error("seat swap boarding pass email failed:", e.message),
      );

      const targetBoarding = seatMovedToEmptySeat({
        passengerName: accepterInfo.name,
        bookingId: tB.booking_id,
        flightNumber: flight.flight_number,
        origin: flight.origin,
        destination: flight.destination,
        departureTime: flight.departure_time,
        boardingTime,
        fromSeatNumber: seatRowB.seat_number,
        toSeatNumber: seatRowA.seat_number,
        priceDelta: targetDelta,
        bookingTotal: targetBookingTotal,
        passengers: targetBooking.passengers,
        seatClass: seatRowA.class,
      });
      sendEmail(
        accepterInfo.email,
        targetBoarding.subject,
        targetBoarding.html,
      ).catch((e) =>
        console.error("seat swap boarding pass email failed:", e.message),
      );
    } catch (notifyErr) {
      console.error(
        "createNotification (seat_swap_accepted):",
        notifyErr.message,
      );
    }

    return {
      ok: true,
      id: requestId,
      status: "accepted",
      requester_price_delta: requesterDelta,
      target_price_delta: targetDelta,
      message:
        targetDelta > 0
          ? `Swap accepted. NPR ${Number(targetDelta).toLocaleString()} was charged for your new seat.`
          : targetDelta < 0
            ? `Swap accepted. NPR ${Number(Math.abs(targetDelta)).toLocaleString()} was refunded for your new seat.`
            : "Swap accepted. No fare difference.",
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function declineSwapRequest(requestId, userId) {
  const result = await pool.query(
    `UPDATE seat_swap_requests
     SET status = 'declined'
     WHERE id = $1 AND target_user_id = $2 AND status = 'pending'
     RETURNING id, requester_user_id, flight_id`,
    [requestId, userId],
  );
  if (result.rowCount === 0) {
    const exists = await pool.query(
      "SELECT id, status, target_user_id FROM seat_swap_requests WHERE id = $1",
      [requestId],
    );
    if (exists.rowCount === 0) {
      throw Object.assign(new Error("Swap request not found."), {
        statusCode: 404,
      });
    }
    const row = exists.rows[0];
    if (row.target_user_id !== userId) {
      throw Object.assign(
        new Error("You can only decline requests addressed to you."),
        { statusCode: 403 },
      );
    }
    throw Object.assign(new Error("This swap request is no longer pending."), {
      statusCode: 409,
    });
  }

  const declined = result.rows[0];
  try {
    const [flightInfo, requesterInfo] = await Promise.all([
      pool.query(
        "SELECT flight_number, origin, destination FROM flights WHERE id = $1",
        [declined.flight_id],
      ),
      pool.query("SELECT name, email FROM users WHERE id = $1", [
        declined.requester_user_id,
      ]),
    ]);
    const f = flightInfo.rows[0];
    const requester = requesterInfo.rows[0] || {};
    const route = f
      ? `${f.flight_number} (${f.origin} → ${f.destination})`
      : "your flight";
    await createNotification(pool, {
      userId: declined.requester_user_id,
      type: "seat_swap_declined",
      title: "Seat swap declined",
      message: `Your seat swap request for ${route} was declined.`,
      relatedBookingId: null,
    });

    const mail = swapDeclined({
      requesterName: requester.name,
      flightNumber: f?.flight_number,
      origin: f?.origin,
      destination: f?.destination,
    });
    sendEmail(requester.email, mail.subject, mail.html).catch((e) =>
      console.error("seat swap declined email failed:", e.message),
    );
  } catch (notifyErr) {
    console.error(
      "createNotification (seat_swap_declined):",
      notifyErr.message,
    );
  }

  return { ok: true, id: requestId, status: "declined" };
}

module.exports = {
  createSwapRequest,
  listPendingForUser,
  acceptSwapRequest,
  declineSwapRequest,
};
