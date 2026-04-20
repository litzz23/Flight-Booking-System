const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const flightRoutes = require("./routes/flights");
const bookingRoutes = require("./routes/bookings");
const walletRoutes = require("./routes/wallet");
const paymentRoutes = require("./routes/payments");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
const seatRoutes = require("./routes/seats");
const swapRequestRoutes = require("./routes/swapRequests");
const predictionRoutes = require("./routes/predictions");
const recommendationRoutes = require("./routes/recommendations");
const notificationRoutes = require("./routes/notifications");
const reviewRoutes = require("./routes/reviews");
const { ensureNotificationsTable } = require("./db/ensureNotificationsTable");
const { releaseExpiredReservations } = require("./services/seatService");
const { generateNextWeekFlights } = require("./services/weeklyFlightGenerator");
const { roundMoney } = require("./utils/walletLedger");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/flights", flightRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", seatRoutes);
app.use("/api", swapRequestRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/recommendations", recommendationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reviews", reviewRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Binayak Airlines API is running" });
});

app.get("/api/round-money", (req, res) => {
  const raw = req.query.value ?? req.query.n;
  if (raw === undefined || raw === "") {
    return res.status(400).json({
      error: "Missing query parameter: `value` or `n` (finite number).",
    });
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return res.status(400).json({ error: "value must be a finite number." });
  }
  res.json({ input: value, rounded: roundMoney(value) });
});

const server = app.listen(PORT, async () => {
  try {
    await ensureNotificationsTable();
    const result = await generateNextWeekFlights();
    if (result.created > 0) {
      console.log(
        `Weekly flights generated: ${result.created} new (skipped ${result.skipped}) across ${result.routes} route(s).`,
      );
    }
  } catch (err) {
    console.error("Startup initialization failed:", err.message);
  }
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other Node process: lsof -i :${PORT}  then kill <PID>`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

let nodemonRestarting = false;
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGUSR2", () => {
  if (nodemonRestarting) return;
  nodemonRestarting = true;
  server.close(() => {
    process.kill(process.pid, "SIGUSR2");
  });
});

setInterval(async () => {
  try {
    await releaseExpiredReservations();
  } catch (err) {
    console.error("Seat reservation cleanup failed:", err.message);
  }
}, 60 * 1000);

setInterval(
  async () => {
    try {
      const result = await generateNextWeekFlights();
      if (result.created > 0) {
        console.log(
          `Weekly flights generated: ${result.created} new (skipped ${result.skipped}) across ${result.routes} route(s).`,
        );
      }
    } catch (err) {
      console.error("Weekly flight generation failed:", err.message);
    }
  },
  7 * 24 * 60 * 60 * 1000,
);
