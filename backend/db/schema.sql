CREATE DATABASE binayak_flights;

\c binayak_flights;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    email_verified BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE flights (
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
);

CREATE TABLE destinations (
    id SERIAL PRIMARY KEY,
    city VARCHAR(100) UNIQUE NOT NULL,
    image_url TEXT,
    tagline VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bookings (
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
    passenger_details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE seats (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    seat_number VARCHAR(5) NOT NULL,
    class VARCHAR(20) NOT NULL CHECK (class IN ('economy', 'business')),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'booked')),
    reserved_until TIMESTAMPTZ,
    reserved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (flight_id, seat_number)
);

CREATE TABLE tickets (
    id SERIAL PRIMARY KEY,
    booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    passenger_name VARCHAR(100) NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female')),
    show_gender_on_map BOOLEAN NOT NULL DEFAULT true,
    accept_peer_swap BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE seat_swap_requests (
    id SERIAL PRIMARY KEY,
    flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_seat INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_seat INTEGER NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
    requester_gender VARCHAR(10) NOT NULL CHECK (requester_gender IN ('male', 'female')),
    target_gender VARCHAR(10) NOT NULL CHECK (target_gender IN ('male', 'female')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX seat_swap_requests_pending_requester_seat ON seat_swap_requests (requester_seat) WHERE status = 'pending';
CREATE UNIQUE INDEX seat_swap_requests_pending_target_seat ON seat_swap_requests (target_seat) WHERE status = 'pending';

CREATE INDEX idx_flights_origin ON flights(origin);
CREATE INDEX idx_flights_destination ON flights(destination);
CREATE INDEX idx_flights_departure ON flights(departure_time);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_flight ON bookings(flight_id);
CREATE INDEX idx_seats_flight_id ON seats(flight_id);
CREATE INDEX idx_seats_seat_number ON seats(seat_number);
CREATE INDEX idx_seats_reserved_until ON seats(reserved_until);

CREATE TABLE wallet_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    type VARCHAR(40) NOT NULL,
    reference_id INTEGER,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_user_created ON wallet_transactions(user_id, created_at DESC);

CREATE TABLE khalti_transactions (
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
);

CREATE INDEX idx_khalti_tx_user_created ON khalti_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(40) NOT NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    related_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
    related_flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE email_otps (
    id SERIAL PRIMARY KEY,
    email VARCHAR(150) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_email_otps_email ON email_otps(email);

-- Flight seed rows generated via db/generate_flights_seed.js
INSERT INTO flights (flight_number, airline, origin, destination, departure_time, arrival_time, price, original_price, total_seats, available_seats, image_url, tagline, discount) VALUES
('BAPK01', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-02 08:07:00', '2026-04-02 08:37:00', 3900, 5625, 48, 24, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 31),
('BAPK02', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-03 10:14:00', '2026-04-03 10:44:00', 4050, 5950, 48, 28, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 32),
('BAPK03', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-04 12:21:00', '2026-04-04 12:51:00', 3975, 5925, 48, 33, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 33),
('BAPK04', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-05 14:28:00', '2026-04-05 14:58:00', 3675, 5150, 48, 37, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 29),
('BAPK05', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-06 16:35:00', '2026-04-06 17:05:00', 3750, 5175, 48, 20, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 28),
('BAPK06', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-07 06:42:00', '2026-04-07 07:12:00', 3850, 5825, 48, 24, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 34),
('BAPK07', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-08 08:49:00', '2026-04-08 09:19:00', 3925, 5425, 48, 28, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 28),
('BAPK08', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-09 10:56:00', '2026-04-09 11:26:00', 3700, 5650, 48, 33, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 35),
('BAPK09', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-10 12:03:00', '2026-04-10 12:33:00', 4000, 5600, 48, 37, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 29),
('BAPK10', 'Binayak Airlines', 'Kathmandu', 'Pokhara', '2026-04-11 14:10:00', '2026-04-11 14:40:00', 4100, 6275, 48, 20, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Phewa Lake & Annapurna · Binayak Airlines', 35),
('BALK01', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-02 08:07:00', '2026-04-02 08:42:00', 21000, 29250, 18, 9, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 28),
('BALK02', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-03 10:14:00', '2026-04-03 10:49:00', 20600, 29450, 18, 10, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 30),
('BALK03', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-04 12:21:00', '2026-04-04 12:56:00', 23950, 36650, 18, 12, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 35),
('BALK04', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-05 14:28:00', '2026-04-05 15:03:00', 22550, 34725, 18, 14, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 35),
('BALK05', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-06 16:35:00', '2026-04-06 17:10:00', 19125, 27150, 18, 7, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 30),
('BALK06', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-07 06:42:00', '2026-04-07 07:17:00', 20325, 31500, 18, 9, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 35),
('BALK07', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-08 08:49:00', '2026-04-08 09:24:00', 21100, 29950, 18, 10, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 30),
('BALK08', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-09 10:56:00', '2026-04-09 11:31:00', 18725, 26025, 18, 12, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 28),
('BALK09', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-10 12:03:00', '2026-04-10 12:38:00', 21025, 32375, 18, 14, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 35),
('BALK10', 'Binayak Airlines', 'Kathmandu', 'Lukla', '2026-04-11 14:10:00', '2026-04-11 14:45:00', 22675, 31525, 18, 7, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Everest trailhead · Binayak Airlines', 28),
('BABP01', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-02 08:07:00', '2026-04-02 08:32:00', 4900, 7200, 48, 24, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 32),
('BABP02', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-03 10:14:00', '2026-04-03 10:39:00', 4750, 7125, 48, 28, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 33),
('BABP03', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-04 12:21:00', '2026-04-04 12:46:00', 4625, 6750, 48, 33, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 31),
('BABP04', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-05 14:28:00', '2026-04-05 14:53:00', 4525, 6475, 48, 37, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 30),
('BABP05', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-06 16:35:00', '2026-04-06 17:00:00', 4500, 6700, 48, 20, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 33),
('BABP06', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-07 06:42:00', '2026-04-07 07:07:00', 4550, 6725, 48, 24, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 32),
('BABP07', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-08 08:49:00', '2026-04-08 09:14:00', 4725, 7225, 48, 28, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 35),
('BABP08', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-09 10:56:00', '2026-04-09 11:21:00', 4200, 6300, 48, 33, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 33),
('BABP09', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-10 12:03:00', '2026-04-10 12:28:00', 4750, 6800, 48, 37, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 30),
('BABP10', 'Binayak Airlines', 'Kathmandu', 'Bharatpur', '2026-04-11 14:10:00', '2026-04-11 14:35:00', 4550, 6825, 48, 20, 'https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=400&h=280&fit=crop', 'Chitwan & safari · Binayak Airlines', 33),
('BABH01', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-02 08:07:00', '2026-04-02 08:57:00', 7950, 11525, 48, 24, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 31),
('BABH02', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-03 10:14:00', '2026-04-03 11:04:00', 7950, 11775, 48, 28, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 32),
('BABH03', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-04 12:21:00', '2026-04-04 13:11:00', 9275, 13725, 48, 33, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 32),
('BABH04', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-05 14:28:00', '2026-04-05 15:18:00', 8500, 11975, 48, 37, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 29),
('BABH05', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-06 16:35:00', '2026-04-06 17:25:00', 7375, 11425, 48, 20, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 35),
('BABH06', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-07 06:42:00', '2026-04-07 07:32:00', 7600, 11400, 48, 24, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 33),
('BABH07', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-08 08:49:00', '2026-04-08 09:39:00', 8225, 12750, 48, 28, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 35),
('BABH08', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-09 10:56:00', '2026-04-09 11:46:00', 7225, 10975, 48, 33, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 34),
('BABH09', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-10 12:03:00', '2026-04-10 12:53:00', 8125, 11450, 48, 37, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 29),
('BABH10', 'Binayak Airlines', 'Kathmandu', 'Bhadrapur', '2026-04-11 14:10:00', '2026-04-11 15:00:00', 8550, 13000, 48, 20, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=280&fit=crop', 'Eastern hills · Binayak Airlines', 34),
('BANG01', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-02 08:07:00', '2026-04-02 09:17:00', 9325, 14000, 48, 24, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 33),
('BANG02', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-03 10:14:00', '2026-04-03 11:24:00', 9700, 14850, 48, 28, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 35),
('BANG03', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-04 12:21:00', '2026-04-04 13:31:00', 9150, 13075, 48, 33, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 30),
('BANG04', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-05 14:28:00', '2026-04-05 15:38:00', 9900, 14450, 48, 37, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 31),
('BANG05', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-06 16:35:00', '2026-04-06 17:45:00', 9025, 13550, 48, 20, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 33),
('BANG06', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-07 06:42:00', '2026-04-07 07:52:00', 8700, 12625, 48, 24, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 31),
('BANG07', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-08 08:49:00', '2026-04-08 09:59:00', 8275, 12425, 48, 28, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 33),
('BANG08', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-09 10:56:00', '2026-04-09 12:06:00', 8200, 12050, 48, 33, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 32),
('BANG09', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-10 12:03:00', '2026-04-10 13:13:00', 9150, 13350, 48, 37, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 31),
('BANG10', 'Binayak Airlines', 'Kathmandu', 'Nepalgunj', '2026-04-11 14:10:00', '2026-04-11 15:20:00', 9000, 13225, 48, 20, 'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=400&h=280&fit=crop', 'Western Nepal gateway · Binayak Airlines', 32),
('BAGB01', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-02 08:07:00', '2026-04-02 08:42:00', 4675, 6725, 48, 24, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 30),
('BAGB02', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-03 10:14:00', '2026-04-03 10:49:00', 4800, 7050, 48, 28, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 32),
('BAGB03', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-04 12:21:00', '2026-04-04 12:56:00', 5175, 7700, 48, 33, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 33),
('BAGB04', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-05 14:28:00', '2026-04-05 15:03:00', 5425, 7600, 48, 37, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 29),
('BAGB05', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-06 16:35:00', '2026-04-06 17:10:00', 4525, 6250, 48, 20, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 28),
('BAGB06', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-07 06:42:00', '2026-04-07 07:17:00', 4725, 7125, 48, 24, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 34),
('BAGB07', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-08 08:49:00', '2026-04-08 09:24:00', 4550, 6275, 48, 28, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 27),
('BAGB08', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-09 10:56:00', '2026-04-09 11:31:00', 4575, 7000, 48, 33, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 35),
('BAGB09', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-10 12:03:00', '2026-04-10 12:38:00', 5000, 7000, 48, 37, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 29),
('BAGB10', 'Binayak Airlines', 'Kathmandu', 'Bhairahawa', '2026-04-11 14:10:00', '2026-04-11 14:45:00', 5325, 8150, 48, 20, 'https://images.unsplash.com/photo-1524492412937-b28076a86647?w=400&h=280&fit=crop', 'Lumbini plains & Terai · Binayak Airlines', 35),
('BASI01', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-02 08:07:00', '2026-04-02 08:27:00', 4250, 6425, 48, 24, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 34),
('BASI02', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-03 10:14:00', '2026-04-03 10:34:00', 5075, 7825, 48, 28, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 35),
('BASI03', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-04 12:21:00', '2026-04-04 12:41:00', 4250, 6025, 48, 33, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 29),
('BASI04', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-05 14:28:00', '2026-04-05 14:48:00', 2925, 4300, 48, 37, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 32),
('BASI05', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-06 16:35:00', '2026-04-06 16:55:00', 3750, 5600, 48, 20, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 33),
('BASI06', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-07 06:42:00', '2026-04-07 07:02:00', 3025, 4350, 48, 24, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 30),
('BASI07', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-08 08:49:00', '2026-04-08 09:09:00', 4200, 6250, 48, 28, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 33),
('BASI08', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-09 10:56:00', '2026-04-09 11:16:00', 2775, 4050, 48, 33, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 31),
('BASI09', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-10 12:03:00', '2026-04-10 12:23:00', 4225, 6200, 48, 37, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 32),
('BASI10', 'Binayak Airlines', 'Kathmandu', 'Simara', '2026-04-11 14:10:00', '2026-04-11 14:30:00', 4275, 6250, 48, 20, 'https://images.unsplash.com/photo-1486911278844-a81c5267e227?w=400&h=280&fit=crop', 'Terai corridor · Binayak Airlines', 32),
('PKTK01', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-16 09:11:00', '2026-04-16 09:41:00', 4000, 6125, 48, 23, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 35),
('PKTK02', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-17 11:22:00', '2026-04-17 11:52:00', 4175, 6000, 48, 27, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 30),
('PKTK03', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-18 13:33:00', '2026-04-18 14:03:00', 4250, 6200, 48, 32, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 31),
('PKTK04', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-19 15:44:00', '2026-04-19 16:14:00', 3975, 5575, 48, 37, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 29),
('PKTK05', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-20 17:55:00', '2026-04-20 18:25:00', 3700, 5375, 48, 18, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 31),
('PKTK06', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-21 08:06:00', '2026-04-21 08:36:00', 4025, 5825, 48, 23, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 31),
('PKTK07', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-22 10:17:00', '2026-04-22 10:47:00', 3700, 5025, 48, 27, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 26),
('PKTK08', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-23 12:28:00', '2026-04-23 12:58:00', 3550, 4900, 48, 32, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 28),
('PKTK09', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-24 14:39:00', '2026-04-24 15:09:00', 3925, 5800, 48, 37, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 32),
('PKTK10', 'Binayak Airlines', 'Pokhara', 'Kathmandu', '2026-04-25 16:50:00', '2026-04-25 17:20:00', 4000, 5525, 48, 18, 'https://images.unsplash.com/photo-1605640840605-14ac1855827b?w=400&h=280&fit=crop', 'Return to Kathmandu · Binayak Airlines', 28),
('LKTK01', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-16 09:11:00', '2026-04-16 09:46:00', 19725, 29400, 18, 8, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 33),
('LKTK02', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-17 11:22:00', '2026-04-17 11:57:00', 21275, 32350, 18, 10, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 34),
('LKTK03', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-18 13:33:00', '2026-04-18 14:08:00', 22000, 31250, 18, 12, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 30),
('LKTK04', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-19 15:44:00', '2026-04-19 16:19:00', 22650, 32625, 18, 14, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 31),
('LKTK05', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-20 17:55:00', '2026-04-20 18:30:00', 21225, 29925, 18, 6, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 29),
('LKTK06', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-21 08:06:00', '2026-04-21 08:41:00', 20125, 28375, 18, 8, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 29),
('LKTK07', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-22 10:17:00', '2026-04-22 10:52:00', 19100, 29025, 18, 10, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 34),
('LKTK08', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-23 12:28:00', '2026-04-23 13:03:00', 20925, 32225, 18, 12, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 35),
('LKTK09', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-24 14:39:00', '2026-04-24 15:14:00', 21925, 33325, 18, 14, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 34),
('LKTK10', 'Binayak Airlines', 'Lukla', 'Kathmandu', '2026-04-25 16:50:00', '2026-04-25 17:25:00', 22600, 34800, 18, 6, 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=400&h=280&fit=crop', 'Return from Everest · Binayak Airlines', 35);
