# Binayak Jets ✈️

A full-stack flight booking web application built as a Final Year Project.
Stack: React (Vite) · Express.js · PostgreSQL · Node.js

## Requirements

- Node.js 18+
- PostgreSQL 14+
- Groq API key (for AI price predictions)
- Khalti account (for payment integration)

## Getting Started

### Backend

```bash
cd backend
cp .env.example .env
# Fill in: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, GROQ_API_KEY, KHALTI_SECRET_KEY
npm install
node db/init.js            # creates all tables
node db/reseed_flights.js  # seeds flight and seat data
npm start                  # starts the Express server
```

The API runs on PORT from .env (default 5000).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Make sure frontend/src/api.js points to the correct backend port before running.

## Features

- Flight Search and Discovery — Search flights by origin, destination, date, cabin class, and passenger count. Results are ranked smartly by price, duration, departure time, and available discounts. A 7-day fare grid shows the cheapest available fare for each date on a selected route, and filters let users narrow down by stops, airline, and price range.

- Interactive Seat Selection — A full aircraft seat map renders Business and Economy class sections with individual seat states such as available, reserved, and selected. Seats include gender-preference indicators and are locked in real time when a passenger selects them, with automatic release after 60 seconds if booking is not completed.

- Multi-Passenger Booking — Supports booking for multiple passengers in a single flow, collecting name, email, phone, and gender per passenger. Cancellations follow a tiered refund policy: full refund if cancelled 48 hours or more before departure, 75 percent between 24 and 48 hours, and 50 percent under 24 hours.

- Wallet and Khalti Payments — Each user has an NPR wallet showing live balance, preset top-up amounts, and a full transaction history. Wallet funding is handled through the Khalti payment gateway with a redirect and callback flow. All balance updates use an atomic ledger to prevent race conditions.

- Peer Seat Swaps — Passengers on the same flight can request a seat swap with each other. The swap modal shows a live seat map with a before and after preview of both seats. The receiving passenger can accept or decline, and ownership is validated on both sides before the swap is confirmed.

- AI Price and Risk Predictions — Each flight shows a predicted price based on demand level, seat occupancy, seasonality, and time to departure. A separate cancellation risk score is calculated using destination region, weather season, departure hour, and schedule window. Both are powered by Groq LLM with a heuristic fallback when the API is unavailable.

- User Dashboard — A personal analytics dashboard showing stat cards for total bookings, total spending, and upcoming flights. Includes a booking trend line chart, monthly spending bar chart, booking status pie chart, an upcoming flights panel, and AI-powered route recommendations based on the user's booking history.

- Notifications — An in-app notification bell in the header shows an unread count and a dropdown list of recent notifications. Notifications are triggered automatically on booking creation, booking cancellation, wallet top-up, and when an admin broadcasts an alert for a flight the user is on.

- Reviews — Logged-in passengers can submit a flight experience review with a star rating, route, and written feedback. All reviews are visible publicly on the reviews page and are sorted by most recent.

- Admin Panel — A separate admin interface with its own login, sidebar navigation, and protected routes. Admins can manage flights, bookings, users, and destinations with full create, read, update, and delete operations. The dashboard shows revenue totals, booking counts, and recent activity. Admins can also send targeted alerts to all passengers on a specific flight, with alert types including delay, cancellation, weather warning, and emergency.

## License
