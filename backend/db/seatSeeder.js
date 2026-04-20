const SEAT_COLUMNS = ["A", "B", "C", "D", "E", "F"];
const BUSINESS_CLASS_MAX_ROW = 4;
const MAX_SEATS = 300;

function buildSeatsForFlight(flightId, totalSeats) {
  const cap = Math.min(
    Math.max(1, Math.floor(Number(totalSeats)) || 0),
    MAX_SEATS,
  );
  const seats = [];
  let count = 0;
  outer: for (let row = 1; row <= 200; row++) {
    for (const col of SEAT_COLUMNS) {
      if (count >= cap) break outer;
      seats.push({
        flightId,
        seatNumber: `${row}${col}`,
        seatClass: row <= BUSINESS_CLASS_MAX_ROW ? "business" : "economy",
      });
      count++;
    }
  }
  return seats;
}

async function seedSeatsForAllFlights(client) {
  const { rows: flights } = await client.query("SELECT id FROM flights");
  for (const flight of flights) {
    await seedSeatsForFlight(client, flight.id);
  }
}

async function seedSeatsForFlight(client, flightId) {
  const { rows } = await client.query(
    "SELECT total_seats FROM flights WHERE id = $1",
    [flightId],
  );
  const totalSeats = rows[0]?.total_seats ?? 72;
  const seats = buildSeatsForFlight(flightId, totalSeats);
  for (const seat of seats) {
    await client.query(
      `INSERT INTO seats (flight_id, seat_number, class, status)
       VALUES ($1, $2, $3, 'available')
       ON CONFLICT (flight_id, seat_number) DO NOTHING`,
      [seat.flightId, seat.seatNumber, seat.seatClass],
    );
  }
}

module.exports = {
  seedSeatsForAllFlights,
  seedSeatsForFlight,
};
