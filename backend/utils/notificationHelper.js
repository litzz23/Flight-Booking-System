async function createNotification(
  client,
  {
    userId,
    type,
    title,
    message,
    relatedBookingId = null,
    relatedFlightId = null,
  },
) {
  await client.query(
    "INSERT INTO notifications (user_id, type, title, message, related_booking_id, related_flight_id) VALUES ($1,$2,$3,$4,$5,$6)",
    [userId, type, title, message, relatedBookingId, relatedFlightId],
  );
}

module.exports = { createNotification };
