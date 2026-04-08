const express = require('express')
const cors = require('cors')
require('dotenv').config()

const authRoutes = require('./routes/auth')
const flightRoutes = require('./routes/flights')
const bookingRoutes = require('./routes/bookings')
const walletRoutes = require('./routes/wallet')
const paymentRoutes = require('./routes/payments')
const seatRoutes = require('./routes/seats')
const swapRequestRoutes = require('./routes/swapRequests')
const { releaseExpiredReservations } = require('./services/seatService')

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/flights', flightRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api', seatRoutes)
app.use('/api', swapRequestRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Binayak Flights API is running' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

setInterval(async () => {
  try {
    await releaseExpiredReservations()
  } catch (err) {
    console.error('Seat reservation cleanup failed:', err.message)
  }
}, 60 * 1000)
