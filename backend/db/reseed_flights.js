/**
 * Clears flights (and dependent bookings) and inserts the full seed from flights_seed_values.txt.
 * Run from backend: node db/reseed_flights.js
 */
const fs = require('fs')
const path = require('path')
const pool = require('./pool')
const { seedSeatsForAllFlights } = require('./seatSeeder')

async function reseed() {
  const seedPath = path.join(__dirname, 'flights_seed_values.txt')
  if (!fs.existsSync(seedPath)) {
    console.error('Missing flights_seed_values.txt next to this script.')
    process.exit(1)
  }

  let seedValues = fs.readFileSync(seedPath, 'utf8').trim()
  const lines = seedValues.split('\n')
  lines[lines.length - 1] = lines[lines.length - 1].replace(/\)$/, ');')
  seedValues = lines.join('\n')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM seat_swap_requests')
    await client.query('DELETE FROM tickets')
    await client.query('DELETE FROM seats')
    await client.query('DELETE FROM bookings')
    await client.query('DELETE FROM flights')
    await client.query(`
      INSERT INTO flights (flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, image_url, tagline, discount) VALUES
${seedValues}
    `)
    await seedSeatsForAllFlights(client)
    await client.query('COMMIT')
    const { rows } = await client.query('SELECT COUNT(*)::int AS c FROM flights')
    console.log(`Done. Flights in database: ${rows[0].c}`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Reseed failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

reseed()
