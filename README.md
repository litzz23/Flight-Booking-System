# Flights

Flight booking app: React (Vite) frontend and Express + PostgreSQL backend.

## Requirements

- Node.js 18+
- PostgreSQL

## Backend

```bash
cd backend
cp .env.example .env
# Edit .env: DB_* and JWT_SECRET
npm install
# Apply schema (see backend/db/schema.sql) and run your seed/init flow as needed
npm start
```

The API listens on `PORT` from `.env` (default `5000`). Point the frontend base URL in `frontend/src/api.js` at the same port.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Features

- Flight search, filters, and results
- Booking with passenger details and interactive seat map
- Wallet and booking management
- Peer seat swap requests

## License

Add your license here.
