async function getSeatsByFlight(client, flightId) {
  const result = await client.query(
    `SELECT
       s.id,
       s.flight_id,
       s.seat_number,
       s.class,
       s.status,
       s.reserved_until,
       b.user_id AS booked_user_id,
       t.gender AS booked_gender
     FROM seats s
     LEFT JOIN tickets t ON t.seat_id = s.id
     LEFT JOIN bookings b ON b.id = t.booking_id AND b.status = 'confirmed'
     WHERE s.flight_id = $1
     ORDER BY
       CAST(regexp_replace(s.seat_number, '[^0-9]', '', 'g') AS INTEGER),
       regexp_replace(s.seat_number, '[0-9]', '', 'g')`,
    [flightId]
  )
  return result.rows
}

module.exports = {
  getSeatsByFlight,
}
