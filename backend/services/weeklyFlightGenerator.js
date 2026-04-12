const pool = require("../db/pool");
const { seedSeatsForFlight } = require("../db/seatSeeder");

const DEFAULT_TOTAL_SEATS = 72;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function utcDateOnly(d) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function toYmd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clampPrice(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 5000;
}

function routeCode(origin, destination) {
  const a = String(origin || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 2);
  const b = String(destination || "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 2);
  return `${a}${b}`.padEnd(4, "X").slice(0, 4);
}

function flightNumberFor(origin, destination, dateObj, serial) {
  const yy = String(dateObj.getUTCFullYear()).slice(-2);
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const sn = String(serial).padStart(2, "0");
  return `${routeCode(origin, destination)}${yy}${mm}${dd}${sn}`;
}

function pickDailyTimeByRoute(route, dateObj) {
  const seed = flightVariantSeed(route, dateObj);
  const hour = 6 + (seed % 13);
  const minute = [0, 15, 30, 45][Math.floor((seed / 7) % 4)];
  return { hour, minute };
}

function buildTimestampForDate(dateObj, hour, minute) {
  const y = dateObj.getUTCFullYear();
  const m = dateObj.getUTCMonth();
  const d = dateObj.getUTCDate();
  return new Date(Date.UTC(y, m, d, hour, minute, 0));
}

function varyPrice(basePrice, dateObj) {
  const dow = dateObj.getUTCDay();
  let mult = 1;
  if (dow === 0 || dow === 6) mult *= 1.08;
  if (dow === 5) mult *= 1.04;
  const noise = ((dateObj.getUTCDate() % 5) - 2) * 0.015;
  return clampPrice(basePrice * (mult + noise));
}

function realisticPriceBand(route, durationSeconds) {
  const origin = String(route.origin || "")
    .trim()
    .toLowerCase();
  const destination = String(route.destination || "")
    .trim()
    .toLowerCase();
  const dominantCity = destination === "kathmandu" ? origin : destination;
  const durationMinutes = Math.max(20, Math.round(durationSeconds / 60));

  if (dominantCity === "lukla") return { min: 19000, max: 23500 };
  if (dominantCity === "pokhara") return { min: 3500, max: 4600 };
  if (dominantCity === "bharatpur") return { min: 4000, max: 5250 };
  if (dominantCity === "bhairahawa") return { min: 4300, max: 5400 };
  if (/\bsimara\b/.test(dominantCity)) return { min: 2500, max: 4200 };
  if (dominantCity === "bhadrapur") return { min: 7800, max: 9500 };
  if (dominantCity === "nepalgunj") return { min: 8200, max: 10000 };

  if (durationMinutes <= 25) return { min: 2500, max: 4500 };
  if (durationMinutes <= 35) return { min: 3500, max: 6500 };
  if (durationMinutes <= 50) return { min: 4500, max: 8000 };
  if (durationMinutes <= 70) return { min: 5500, max: 9500 };
  return { min: 7000, max: 12000 };
}

function flightVariantSeed(route, dateObj) {
  return cityHash(
    `${route.origin}|${route.destination}|${toYmd(dateObj)}|${route.airline || ""}`,
  );
}

function cityHash(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i++)
    hash = (hash * 33 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function titleCase(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function fallbackRouteData(origin, destination, imageUrl, tagline) {
  const h = cityHash(`${origin}|${destination}`);
  const durations = [25, 30, 35, 45, 50, 60, 70];
  const durationSeconds = durations[h % durations.length] * 60;
  const band = realisticPriceBand({ origin, destination }, durationSeconds);
  const spread = Math.max(800, band.max - band.min);
  const price = clampPrice(band.min + (h % spread));
  const totalSeats = h % 5 === 0 ? 18 : DEFAULT_TOTAL_SEATS;
  return {
    origin: titleCase(origin),
    destination: titleCase(destination),
    airline: "Binayak Airlines",
    image_url: imageUrl || null,
    tagline: tagline || `${titleCase(destination)} route · Binayak Airlines`,
    total_seats: totalSeats,
    price,
    original_price: Math.round(price * 1.35),
    duration_seconds: durationSeconds,
  };
}

function deriveDailyFlightValues(route, dateObj) {
  const seed = flightVariantSeed(route, dateObj);
  const time = pickDailyTimeByRoute(route, dateObj);
  const baseDurationSeconds = Math.max(
    20 * 60,
    Number(route.duration_seconds || 60 * 60),
  );
  const durationOffsetMinutes = ((seed % 7) - 3) * 5;
  const durationSeconds = Math.max(
    20 * 60,
    baseDurationSeconds + durationOffsetMinutes * 60,
  );
  const band = realisticPriceBand(route, durationSeconds);
  const bandSpread = Math.max(900, band.max - band.min);
  const routePrice = band.min + (seed % bandSpread);
  const price = clampPrice(varyPrice(routePrice, dateObj));
  const original = clampPrice(Math.max(price + 300, price * 1.35));
  const discount = Math.max(
    15,
    Math.min(52, Math.round((1 - price / original) * 100)),
  );
  const totalSeats = Number(route.total_seats || DEFAULT_TOTAL_SEATS);
  const availableSeats = totalSeats;

  return {
    time,
    durationSeconds,
    price,
    original,
    discount,
    availableSeats,
  };
}

async function fetchRouteTemplates(client) {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (origin, destination)
       origin,
       destination,
       airline,
       image_url,
       tagline,
       total_seats,
       price,
       original_price,
       EXTRACT(EPOCH FROM (arrival_time - departure_time))::int AS duration_seconds
     FROM flights
     WHERE status IN ('scheduled', 'delayed', 'completed')
       AND EXISTS (
         SELECT 1
         FROM destinations d1
         WHERE LOWER(TRIM(d1.city)) = LOWER(TRIM(flights.origin))
       )
       AND EXISTS (
         SELECT 1
         FROM destinations d2
         WHERE LOWER(TRIM(d2.city)) = LOWER(TRIM(flights.destination))
       )
     ORDER BY origin, destination, departure_time DESC`,
  );
  return rows;
}

async function fetchDestinationFallbackRoutes(client) {
  const { rows } = await client.query(
    `SELECT city, image_url, tagline
     FROM destinations
     WHERE city IS NOT NULL AND TRIM(city) <> ''
     ORDER BY city ASC`,
  );

  const routes = [];
  for (const row of rows) {
    const city = String(row.city || "").trim();
    if (!city) continue;
    if (city.toLowerCase() === "kathmandu") continue;
    routes.push(
      fallbackRouteData("Kathmandu", city, row.image_url, row.tagline),
    );
    routes.push(
      fallbackRouteData(city, "Kathmandu", row.image_url, row.tagline),
    );
  }
  return routes;
}

async function flightExistsForDay(client, origin, destination, dateObj) {
  const ymd = toYmd(dateObj);
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS c
     FROM flights
     WHERE origin = $1
       AND destination = $2
       AND DATE(departure_time) = $3::date
       AND status IN ('scheduled', 'delayed')`,
    [origin, destination, ymd],
  );
  return (rows[0]?.c || 0) > 0;
}

async function nextAvailableFlightNumber(client, origin, destination, dateObj) {
  for (let serial = 1; serial <= 99; serial++) {
    const candidate = flightNumberFor(origin, destination, dateObj, serial);
    const { rows } = await client.query(
      "SELECT 1 FROM flights WHERE flight_number = $1 LIMIT 1",
      [candidate],
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error(
    `Unable to generate unique flight_number for ${origin} -> ${destination} on ${toYmd(dateObj)}`,
  );
}

async function generateNextWeekFlights() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const routeMap = new Map();
    for (const route of await fetchRouteTemplates(client)) {
      const key = `${String(route.origin || "")
        .trim()
        .toLowerCase()}|${String(route.destination || "")
        .trim()
        .toLowerCase()}`;
      routeMap.set(key, route);
    }
    for (const route of await fetchDestinationFallbackRoutes(client)) {
      const key = `${String(route.origin || "")
        .trim()
        .toLowerCase()}|${String(route.destination || "")
        .trim()
        .toLowerCase()}`;
      if (!routeMap.has(key)) routeMap.set(key, route);
    }
    const templates = [...routeMap.values()];
    if (!templates.length) {
      await client.query("COMMIT");
      return { created: 0, skipped: 0, routes: 0 };
    }

    const start = utcDateOnly(new Date(Date.now() + ONE_DAY_MS));
    const end = new Date(start.getTime() + 7 * ONE_DAY_MS);

    let created = 0;
    let skipped = 0;

    for (const route of templates) {
      const totalSeats = Number(route.total_seats || DEFAULT_TOTAL_SEATS);

      for (
        let d = new Date(start);
        d < end;
        d = new Date(d.getTime() + ONE_DAY_MS)
      ) {
        const exists = await flightExistsForDay(
          client,
          route.origin,
          route.destination,
          d,
        );
        if (exists) {
          skipped++;
          continue;
        }

        const {
          time,
          durationSeconds,
          price,
          original,
          discount,
          availableSeats,
        } = deriveDailyFlightValues(route, d);
        const dep = buildTimestampForDate(d, time.hour, time.minute);
        const arr = new Date(dep.getTime() + durationSeconds * 1000);
        const flightNumber = await nextAvailableFlightNumber(
          client,
          route.origin,
          route.destination,
          d,
        );

        const insert = await client.query(
          `INSERT INTO flights
            (flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, status, image_url, tagline, discount)
           VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'scheduled', $11, $12, $13)
           RETURNING id`,
          [
            flightNumber,
            route.airline || "Binayak Airlines",
            route.origin,
            route.destination,
            dep.toISOString(),
            arr.toISOString(),
            price,
            original,
            totalSeats,
            availableSeats,
            route.image_url || null,
            route.tagline || null,
            discount,
          ],
        );

        await seedSeatsForFlight(client, insert.rows[0].id);
        created++;
      }
    }

    await client.query("COMMIT");
    return { created, skipped, routes: templates.length };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  generateNextWeekFlights,
};
