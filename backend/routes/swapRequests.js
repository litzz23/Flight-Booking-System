const router = require('express').Router()
const { authenticate } = require('../middleware/auth')
const swapRequestController = require('../controllers/swapRequestController')

router.post('/swap-request', authenticate, swapRequestController.createSwapRequest)
router.get('/swap-requests', authenticate, swapRequestController.listSwapRequests)
router.post('/swap-request/:id/accept', authenticate, swapRequestController.acceptSwapRequest)
router.post('/swap-request/:id/decline', authenticate, swapRequestController.declineSwapRequest)

module.exports = router
