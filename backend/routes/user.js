const router = require('express').Router()
const { authenticate, authorizeUser } = require('../middleware/auth')
const userController = require('../controllers/userController')

router.get('/dashboard-stats', authenticate, authorizeUser, userController.getDashboardStats)
router.get('/dashboard-analytics', authenticate, authorizeUser, userController.getDashboardAnalytics)
router.get('/bookings', authenticate, authorizeUser, userController.getUserBookings)
router.put('/cancel-booking/:id', authenticate, authorizeUser, userController.cancelBooking)
router.get('/wallet', authenticate, authorizeUser, userController.getWallet)
router.get('/transactions', authenticate, authorizeUser, userController.getTransactions)
router.put('/change-password', authenticate, authorizeUser, userController.changePassword)

module.exports = router
