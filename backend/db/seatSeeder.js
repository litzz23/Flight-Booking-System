const SEAT_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F']
const BUSINESS_CLASS_MAX_ROW = 4

function buildSeatsForFlight(flightId) {
  const seats = []
  for (let row = 1; row <= 30; row++) {
    for (const col of SEAT_COLUMNS) {
      seats.push({
        flightId,
        seatNumber: `${row}${col}`,
        seatClass: row <= BUSINESS_CLASS_MAX_ROW ? 'business' : 'economy',
      })
    }
  }
  return seats
}

async function seedSeatsForAllFlights(client) {
  const { rows: flights } = await client.query('SELECT id FROM flights')
  for (const flight of flights) {
    const seats = buildSeatsForFlight(flight.id)
    for (const seat of seats) {
      await client.query(
        `INSERT INTO seats (flight_id, seat_number, class, status)
         VALUES ($1, $2, $3, 'available')
         ON CONFLICT (flight_id, seat_number) DO NOTHING`,
        [seat.flightId, seat.seatNumber, seat.seatClass]
      )
    }
  }
}

module.exports = {
  seedSeatsForAllFlights,
}
