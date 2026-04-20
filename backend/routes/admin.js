const router = require("express").Router();
const { authenticate, authorizeAdmin } = require("../middleware/auth");
const adminController = require("../controllers/adminController");

router.post("/auth/login", adminController.adminLogin);

router.use(authenticate, authorizeAdmin);

router.get("/me", adminController.getAdminMe);
router.get("/stats", adminController.getAdminStats);
router.get("/analytics", adminController.getAdminAnalytics);

router.get("/alerts/flights", adminController.getAdminAlertFlights);
router.post("/alerts/broadcast", adminController.broadcastAdminAlert);

router.get("/destinations", adminController.getAdminDestinations);
router.post("/destinations", adminController.createAdminDestination);
router.put("/destinations/:id", adminController.updateAdminDestination);
router.delete("/destinations/:id", adminController.deleteAdminDestination);

router.get("/flights", adminController.getAdminFlights);
router.post("/flights", adminController.createAdminFlight);
router.put("/flights/:id", adminController.updateAdminFlight);
router.delete("/flights/:id", adminController.deleteAdminFlight);

router.get("/bookings", adminController.getAdminBookings);
router.put("/bookings/:id", adminController.updateAdminBooking);

router.get("/users", adminController.getAdminUsers);
router.put("/users/:id/status", adminController.updateAdminUserStatus);
router.post("/users/:id/wallet-adjust", adminController.adjustUserWallet);

module.exports = router;
