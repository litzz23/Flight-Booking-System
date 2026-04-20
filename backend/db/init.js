const fs = require("fs");
const path = require("path");
const pool = require("./pool");
const { seedSeatsForAllFlights } = require("./seatSeeder");

const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          email_verified BOOLEAN NOT NULL DEFAULT true,
          is_active BOOLEAN NOT NULL DEFAULT true,
          role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
          created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS flights (
          id SERIAL PRIMARY KEY,
          flight_number VARCHAR(20) UNIQUE NOT NULL,
          airline VARCHAR(100) NOT NULL,
          origin VARCHAR(100) NOT NULL,
          destination VARCHAR(100) NOT NULL,
          departure_time TIMESTAMP NOT NULL,
          arrival_time TIMESTAMP NOT NULL,
          price NUMERIC(10, 2) NOT NULL,
          original_price NUMERIC(10, 2),
          total_seats INTEGER NOT NULL DEFAULT 72,
          available_seats INTEGER NOT NULL DEFAULT 72,
          status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'delayed', 'cancelled', 'completed')),
          image_url TEXT,
          tagline VARCHAR(255),
          discount INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE,
          passengers INTEGER NOT NULL DEFAULT 1,
          total_price NUMERIC(10, 2) NOT NULL,
          status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed')),
          booking_date TIMESTAMP DEFAULT NOW(),
          passenger_name VARCHAR(100) NOT NULL,
          passenger_email VARCHAR(150) NOT NULL,
          passenger_phone VARCHAR(20),
          seat_class VARCHAR(30) DEFAULT 'Economy' CHECK (seat_class IN ('Economy', 'Business', 'Mixed')),
          created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_flights_origin ON flights(origin)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_flights_destination ON flights(destination)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_flights_departure ON flights(departure_time)`,
    );
    await pool.query(
      `ALTER TABLE flights ALTER COLUMN total_seats SET DEFAULT 72`,
    );
    await pool.query(
      `ALTER TABLE flights ALTER COLUMN available_seats SET DEFAULT 72`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_bookings_flight ON bookings(flight_id)`,
    );

    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0
    `);
    await pool.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT true`,
    );
    await pool.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`,
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        balance_after NUMERIC(12,2) NOT NULL,
        type VARCHAR(40) NOT NULL,
        reference_id INTEGER,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created ON wallet_transactions(user_id, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS khalti_transactions (
        id SERIAL PRIMARY KEY,
        pidx VARCHAR(100) UNIQUE NOT NULL,
        purchase_order_id VARCHAR(120) NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_npr NUMERIC(12,2) NOT NULL,
        amount_paisa INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('initiated', 'completed', 'pending', 'failed', 'expired', 'cancelled')),
        transaction_id VARCHAR(120),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_khalti_tx_user_created ON khalti_transactions(user_id, created_at DESC)
    `);

    await pool.query(`
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passenger_details JSONB
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS seats (
        id SERIAL PRIMARY KEY,
        flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
        seat_number VARCHAR(5) NOT NULL,
        class VARCHAR(20) NOT NULL CHECK (class IN ('economy', 'business')),
        status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'booked')),
        reserved_until TIMESTAMPTZ,
        reserved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (flight_id, seat_number)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        seat_id INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
        passenger_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`,
    );
    await pool.query(
      `UPDATE tickets SET gender = 'male' WHERE gender IS NULL OR gender NOT IN ('male', 'female')`,
    );
    await pool.query(
      `ALTER TABLE tickets ALTER COLUMN gender SET DEFAULT 'male'`,
    );
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE tickets ADD CONSTRAINT tickets_gender_check CHECK (gender IN ('male', 'female'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await pool.query(`ALTER TABLE tickets ALTER COLUMN gender SET NOT NULL`);

    await pool.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS show_gender_on_map BOOLEAN NOT NULL DEFAULT true`,
    );

    await pool.query(
      `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS accept_peer_swap BOOLEAN NOT NULL DEFAULT true`,
    );

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_seats_flight_id ON seats(flight_id)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_seats_seat_number ON seats(seat_number)`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_seats_reserved_until ON seats(reserved_until)`,
    );

    await pool.query(`
      CREATE TABLE IF NOT EXISTS seat_swap_requests (
        id SERIAL PRIMARY KEY,
        flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
        requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requester_seat INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
        target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_seat INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(
      `ALTER TABLE seat_swap_requests ADD COLUMN IF NOT EXISTS requester_gender VARCHAR(10)`,
    );
    await pool.query(
      `ALTER TABLE seat_swap_requests ADD COLUMN IF NOT EXISTS target_gender VARCHAR(10)`,
    );
    await pool.query(`
      UPDATE seat_swap_requests
      SET requester_gender = 'male'
      WHERE requester_gender IS NULL OR requester_gender NOT IN ('male', 'female')
    `);
    await pool.query(`
      UPDATE seat_swap_requests
      SET target_gender = 'male'
      WHERE target_gender IS NULL OR target_gender NOT IN ('male', 'female')
    `);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE seat_swap_requests ADD CONSTRAINT seat_swap_requester_gender_check
          CHECK (requester_gender IN ('male', 'female'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE seat_swap_requests ADD CONSTRAINT seat_swap_target_gender_check
          CHECK (target_gender IN ('male', 'female'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await pool.query(
      `ALTER TABLE seat_swap_requests ALTER COLUMN requester_gender SET DEFAULT 'male'`,
    );
    await pool.query(
      `ALTER TABLE seat_swap_requests ALTER COLUMN target_gender SET DEFAULT 'male'`,
    );
    await pool.query(
      `ALTER TABLE seat_swap_requests ALTER COLUMN requester_gender SET NOT NULL`,
    );
    await pool.query(
      `ALTER TABLE seat_swap_requests ALTER COLUMN target_gender SET NOT NULL`,
    );
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_seat_swap_target_pending
      ON seat_swap_requests (target_user_id, status, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_seat_swap_flight ON seat_swap_requests (flight_id)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS seat_swap_requests_pending_requester_seat
      ON seat_swap_requests (requester_seat) WHERE status = 'pending'
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS seat_swap_requests_pending_target_seat
      ON seat_swap_requests (target_seat) WHERE status = 'pending'
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(40) NOT NULL,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN NOT NULL DEFAULT false,
        related_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        id SERIAL PRIMARY KEY,
        email VARCHAR(150) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used BOOLEAN NOT NULL DEFAULT false
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        route VARCHAR(120) NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        text VARCHAR(500) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC)
    `);

    const { rows } = await pool.query("SELECT COUNT(*) FROM flights");
    if (parseInt(rows[0].count) === 0) {
      const seedPath = path.join(__dirname, "flights_seed_values.txt");
      let seedValues = fs.readFileSync(seedPath, "utf8").trim();
      const lines = seedValues.split("\n");
      lines[lines.length - 1] = lines[lines.length - 1].replace(/\)$/, ");");
      seedValues = lines.join("\n");
      await pool.query(`
        INSERT INTO flights (flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, image_url, tagline, discount) VALUES
${seedValues}
      `);
      console.log(
        "Seed data inserted (~10 flights per KTM destination + return legs)",
      );
    }

    await seedSeatsForAllFlights(pool);

    console.log("Database initialized successfully");
    process.exit(0);
  } catch (err) {
    console.error("Database initialization failed:", err.message);
    process.exit(1);
  }
};

initDB();
