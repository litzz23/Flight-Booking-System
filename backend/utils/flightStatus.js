async function syncPastFlightsStatus(db) {
  const result = await db.query(
    `UPDATE flights
     SET status = 'completed'
     WHERE departure_time < NOW()
       AND status IN ('scheduled', 'delayed')`,
  );
  return result.rowCount || 0;
}

async function syncPastBookingsStatus(db) {
  const result = await db.query(
    `UPDATE bookings b
     SET status = 'completed'
     FROM flights f
     WHERE b.flight_id = f.id
       AND b.status = 'confirmed'
       AND f.departure_time < NOW()
       AND f.status = 'completed'`,
  );
  return result.rowCount || 0;
}

module.exports = {
  syncPastFlightsStatus,
  syncPastBookingsStatus,
};
