const router = require('express').Router()
const { authenticate } = require('../middleware/auth')
const seatController = require('../controllers/seatController')

router.get('/flights/:flightId/seats', seatController.getSeatsByFlight)
router.post('/seats/lock', authenticate, seatController.lockSeats)
router.post('/bookings/:bookingId/confirm-seats', authenticate, seatController.confirmSeats)
router.post('/seats/swap', authenticate, seatController.swapSeat)

module.exports = router
