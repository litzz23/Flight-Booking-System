const router = require("express").Router();
const { authenticate, optionalAuthenticate } = require("../middleware/auth");
const seatController = require("../controllers/seatController");

router.get(
  "/flights/:flightId/seats",
  optionalAuthenticate,
  seatController.getSeatsByFlight,
);
router.get(
  "/seats/:flightId",
  optionalAuthenticate,
  seatController.getSeatsByFlight,
);
router.post("/seats/lock", authenticate, seatController.lockSeats);
router.post(
  "/bookings/:bookingId/confirm-seats",
  authenticate,
  seatController.confirmSeats,
);
router.post("/seats/swap", authenticate, seatController.swapSeat);

module.exports = router;
