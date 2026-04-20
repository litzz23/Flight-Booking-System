import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  bookings as bookingsAPI,
  flights as flightsAPI,
  notifications as notificationsAPI,
  seats as seatsAPI,
  swapRequests as swapRequestsAPI,
} from "../api";
import cloudsBg from "../assets/clouds-bg.png";
import AircraftSeatMap from "./AircraftSeatMap";
import SwapRequestModal from "./SwapRequestModal";
import { getSwapPreviewBlockReason } from "../utils/swapPreviewValidation";
import FlightsHeader from "./flights/FlightsHeader";
import "./FlightDeals.css";
import "./MyBookings.css";

function MyBookings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [incomingSwapRequests, setIncomingSwapRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [swappingId, setSwappingId] = useState(null);
  const [swapModal, setSwapModal] = useState(null);
  const [peerSwapModal, setPeerSwapModal] = useState(null);
  const [peerSubmitting, setPeerSubmitting] = useState(false);
  const [swapReqActionId, setSwapReqActionId] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [policyAck, setPolicyAck] = useState(false);
  const [swapDetailRequest, setSwapDetailRequest] = useState(null);
  const [swapDetailSeats, setSwapDetailSeats] = useState([]);
  const [swapDetailLoading, setSwapDetailLoading] = useState(false);
  const [swapDetailAcceptError, setSwapDetailAcceptError] = useState(null);
  const [swapDetailPendingAction, setSwapDetailPendingAction] = useState(null);
  const [rebookAlts, setRebookAlts] = useState({});
  const [alertsByFlightId, setAlertsByFlightId] = useState({});

  const refreshDashboard = useCallback(async () => {
    if (!user) return;
    try {
      const b = await bookingsAPI.getAll();
      setBookings(b);
    } catch {
    }
    try {
      const payload = await notificationsAPI.flightAlerts();
      const grouped = (payload.notifications || []).reduce((acc, n) => {
        const flightId = Number(n.related_flight_id);
        if (!Number.isInteger(flightId) || flightId <= 0) return acc;
        if (!acc[flightId]) acc[flightId] = [];
        acc[flightId].push(n);
        return acc;
      }, {});
      setAlertsByFlightId(grouped);
    } catch {
      setAlertsByFlightId({});
    }
    try {
      const incoming = await swapRequestsAPI.list();
      setIncomingSwapRequests(incoming);
    } catch {
      setIncomingSwapRequests([]);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    setLoading(true);
    refreshDashboard().finally(() => setLoading(false));
  }, [authLoading, user, navigate, refreshDashboard]);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "visible"
      ) {
        refreshDashboard();
      }
    }, 25000);
    return () => clearInterval(t);
  }, [user, refreshDashboard]);

  useEffect(() => {
    if (loading) return;
    const raw = location.state?.highlightBookingId;
    const hid = raw != null ? Number(raw) : NaN;
    if (!Number.isInteger(hid) || hid <= 0) return;
    if (!bookings.some((b) => Number(b.id) === hid)) {
      navigate(location.pathname, { replace: true, state: {} });
      return;
    }

    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-booking-card="${hid}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("mb-card-highlight");
        window.setTimeout(() => el.classList.remove("mb-card-highlight"), 5000);
      }
      navigate(location.pathname, { replace: true, state: {} });
    });
    return () => cancelAnimationFrame(raf);
  }, [loading, bookings, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!peerSwapModal) return;
    const flightId = peerSwapModal.booking?.flight_id;
    if (!flightId) return;
    const t = setInterval(async () => {
      try {
        const seats = await flightsAPI.getSeats(flightId);
        setPeerSwapModal((prev) => (prev ? { ...prev, seats } : null));
      } catch {
      }
    }, 15000);
    return () => clearInterval(t);
  }, [peerSwapModal?.booking?.flight_id]);

  const loadAlternatives = async (bookingId) => {
    setRebookAlts((prev) => ({
      ...prev,
      [bookingId]: { loading: true, data: null, error: null },
    }));
    try {
      const data = await bookingsAPI.getAlternatives(bookingId);
      setRebookAlts((prev) => ({
        ...prev,
        [bookingId]: { loading: false, data, error: null },
      }));
    } catch (err) {
      setRebookAlts((prev) => ({
        ...prev,
        [bookingId]: {
          loading: false,
          data: null,
          error: err.message || "Failed to load alternatives.",
        },
      }));
    }
  };

  const openCancelModal = (b) => {
    setPolicyAck(false);
    setCancelModal(b);
  };

  const closeCancelModal = () => {
    setCancelModal(null);
    setPolicyAck(false);
  };

  const confirmCancel = async () => {
    if (!cancelModal || !policyAck) return;
    const id = cancelModal.id;
    setCancellingId(id);
    try {
      const res = await bookingsAPI.cancel(id);
      await refreshUser();
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id
            ? {
                ...b,
                status: "cancelled",
                cancellation: {
                  ...b.cancellation,
                  allowed: false,
                  reason: "This booking is already cancelled.",
                },
              }
            : b,
        ),
      );
      closeCancelModal();
      const refund =
        res.refund_amount != null ? formatPrice(res.refund_amount) : null;
      const fee = res.fee_amount != null ? formatPrice(res.fee_amount) : null;
      const credited =
        res.wallet_credit != null && Number(res.wallet_credit) > 0
          ? `Credited to wallet: ${formatPrice(res.wallet_credit)}`
          : null;
      alert(
        [
          res.message,
          refund != null && `Estimated refund: ${refund}`,
          fee != null &&
            Number(res.fee_amount) > 0 &&
            `Cancellation fee: ${fee}`,
          credited,
        ]
          .filter(Boolean)
          .join("\n\n"),
      );
    } catch (err) {
      alert(err.message);
    } finally {
      setCancellingId(null);
    }
  };

  const formatPrice = (num) => "NPR " + Number(num).toLocaleString();
  const toMoneyNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const roundMoney = (value) => Math.round(Number(value) * 100) / 100;
  const getSeatPrice = (seat) => toMoneyNumber(seat?.price);
  const getAdjustedTotal = ({ bookingTotal, fromSeat, toSeat }) => {
    const total = toMoneyNumber(bookingTotal);
    const fromPrice = getSeatPrice(fromSeat);
    const toPrice = getSeatPrice(toSeat);
    if (total == null || fromPrice == null || toPrice == null) return null;
    const delta = roundMoney(toPrice - fromPrice);
    return roundMoney(total + delta);
  };
  const renderSeatMapPricePreview = ({ bookingTotal, fromSeat, toSeat }) => {
    const currentTotal = toMoneyNumber(bookingTotal);
    if (currentTotal == null) return null;
    const newTotal = getAdjustedTotal({ bookingTotal, fromSeat, toSeat });
    const diff = newTotal == null ? null : newTotal - currentTotal;
    return (
      <div className="mb-seat-total-preview" aria-live="polite">
        <p className="mb-seat-total-preview-kicker">Fare preview</p>
        <div className="mb-seat-total-preview-grid">
          <div>
            <span className="mb-seat-total-preview-label">Current total</span>
            <strong className="mb-seat-total-preview-value">
              {formatPrice(currentTotal)}
            </strong>
          </div>
          <div>
            <span className="mb-seat-total-preview-label">New total</span>
            <strong className="mb-seat-total-preview-value">
              {newTotal == null ? "Select a seat" : formatPrice(newTotal)}
            </strong>
          </div>
          <div>
            <span className="mb-seat-total-preview-label">Difference</span>
            <strong
              className={`mb-seat-total-preview-value ${
                diff == null
                  ? ""
                  : diff > 0
                    ? "mb-seat-diff-up"
                    : diff < 0
                      ? "mb-seat-diff-down"
                      : "mb-seat-diff-flat"
              }`}
            >
              {diff == null
                ? "-"
                : diff === 0
                  ? "No change"
                  : `${diff > 0 ? "+" : "-"}${formatPrice(Math.abs(diff))}`}
            </strong>
          </div>
        </div>
      </div>
    );
  };
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const alertTypeLabel = (type) => {
    if (type === "delay") return "Flight Delay";
    if (type === "cancelled") return "Flight Cancelled";
    if (type === "weather") return "Weather Warning";
    if (type === "disaster") return "Emergency Alert";
    return "Flight Alert";
  };
  const genderLabel = (g) =>
    g === "female" ? "Female" : g === "male" ? "Male" : "";

  const downloadBoardingPass = (b) => {
    const dep = new Date(b.departure_time);
    const dateStr = dep.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const timeStr = dep.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const boardingDep = new Date(dep.getTime() - 20 * 60 * 1000);
    const boardingStr = boardingDep.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const seatNumber = b.seat_assignments?.[0]?.seat_number || "TBA";
    const passengerName = b.passenger_name || "Passenger";

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boarding Pass - ${b.flight_number}</title>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#0a0a1a;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px;font-family:'Barlow Condensed',sans-serif;}
    .card{width:620px;background:#141428;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);}
    .top{background:#1e1e3f;padding:24px 28px 20px;}
    .header-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;}
    .sublabel{font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.3);text-transform:uppercase;margin-bottom:4px;}
    .airline{font-size:22px;font-weight:700;color:#e8d48b;letter-spacing:2px;text-transform:uppercase;}
    .badge{background:rgba(232,212,139,0.12);border:1px solid rgba(232,212,139,0.3);color:#e8d48b;font-size:11px;letter-spacing:2px;padding:4px 10px;border-radius:4px;text-transform:uppercase;}
    .route{display:flex;align-items:center;justify-content:space-between;margin:0 0 24px;}
    .code{font-size:56px;font-weight:700;color:#fff;line-height:1;}
    .city{font-size:12px;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;margin-top:4px;}
    .arrow-block{text-align:center;}
    .arrow-line{display:flex;align-items:center;gap:8px;}
    .line{width:60px;height:1px;background:rgba(255,255,255,0.15);}
    .plane{font-size:24px;color:#e8d48b;}
    .fno{font-size:11px;color:rgba(255,255,255,0.3);letter-spacing:2px;margin-top:4px;}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);}
    .cell{padding:10px 0;border-right:1px solid rgba(255,255,255,0.06);}
    .cell:last-child{border:none;}
    .cell.pl{padding-left:12px;}
    .lbl{font-size:9px;letter-spacing:2px;color:rgba(255,255,255,0.3);text-transform:uppercase;margin-bottom:4px;}
    .val{font-size:16px;font-weight:600;color:#fff;}
    .perf{height:18px;background:#0e0e22;border-top:2px dashed rgba(255,255,255,0.1);}
    .bottom{background:#0e0e22;padding:18px 28px;display:flex;gap:20px;align-items:center;}
    .stub{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px 16px;}
    .stub .val{font-size:14px;color:rgba(255,255,255,0.8);}
    .bid{font-family:'Share Tech Mono',monospace;font-size:10px;color:rgba(255,255,255,0.25);margin-top:8px;letter-spacing:1px;}
    @media print{body{background:#0a0a1a;}@page{margin:0;size:A5 landscape;}}
  </style></head><body>
  <div class="card">
    <div class="top">
      <div class="header-row">
        <div><div class="sublabel">Boarding Pass</div><div class="airline">Binayak Airlines</div></div>
        <div class="badge">${b.seat_class || "Economy"}</div>
      </div>
      <div class="route">
        <div><div class="code">${b.origin?.slice(0, 3).toUpperCase()}</div><div class="city">${b.origin}</div></div>
        <div class="arrow-block">
          <div class="arrow-line"><div class="line"></div><div class="plane">✈</div><div class="line"></div></div>
          <div class="fno">${b.flight_number}</div>
        </div>
        <div style="text-align:right"><div class="code">${b.destination?.slice(0, 3).toUpperCase()}</div><div class="city">${b.destination}</div></div>
      </div>
      <div class="grid">
        <div class="cell"><div class="lbl">Passenger</div><div class="val" style="font-size:13px;">${passengerName}</div></div>
        <div class="cell pl"><div class="lbl">Date</div><div class="val">${dateStr}</div></div>
        <div class="cell pl"><div class="lbl">Departs</div><div class="val" style="color:#e8d48b">${timeStr}</div></div>
        <div class="cell pl"><div class="lbl">Seat</div><div class="val" style="font-size:22px">${seatNumber}</div></div>
      </div>
    </div>
    <div class="perf"></div>
    <div class="bottom">
      <svg width="72" height="72" viewBox="0 0 72 72"><rect width="72" height="72" fill="#1a1a30" rx="4"/><g fill="rgba(232,212,139,0.7)"><rect x="6" y="6" width="18" height="18" rx="2"/><rect x="8" y="8" width="14" height="14" rx="1" fill="#141428"/><rect x="11" y="11" width="8" height="8" rx="1" fill="rgba(232,212,139,0.7)"/><rect x="48" y="6" width="18" height="18" rx="2"/><rect x="50" y="8" width="14" height="14" rx="1" fill="#141428"/><rect x="53" y="11" width="8" height="8" rx="1" fill="rgba(232,212,139,0.7)"/><rect x="6" y="48" width="18" height="18" rx="2"/><rect x="8" y="50" width="14" height="14" rx="1" fill="#141428"/><rect x="11" y="53" width="8" height="8" rx="1" fill="rgba(232,212,139,0.7)"/><rect x="30" y="6" width="4" height="4"/><rect x="36" y="6" width="4" height="4"/><rect x="42" y="6" width="4" height="4"/><rect x="30" y="12" width="4" height="4"/><rect x="36" y="14" width="4" height="4"/><rect x="6" y="30" width="4" height="4"/><rect x="12" y="30" width="4" height="4"/><rect x="6" y="36" width="4" height="4"/><rect x="30" y="30" width="4" height="4"/><rect x="36" y="30" width="4" height="4"/><rect x="42" y="30" width="4" height="4"/><rect x="30" y="36" width="4" height="4"/><rect x="42" y="36" width="4" height="4"/><rect x="30" y="42" width="4" height="4"/><rect x="36" y="42" width="4" height="4"/><rect x="42" y="42" width="4" height="4"/><rect x="30" y="48" width="4" height="4"/><rect x="36" y="54" width="4" height="4"/><rect x="42" y="48" width="4" height="4"/><rect x="48" y="30" width="4" height="4"/><rect x="54" y="30" width="4" height="4"/><rect x="60" y="30" width="4" height="4"/><rect x="48" y="36" width="4" height="4"/><rect x="60" y="36" width="4" height="4"/><rect x="48" y="42" width="4" height="4"/><rect x="54" y="42" width="4" height="4"/><rect x="60" y="42" width="4" height="4"/></g></svg>
      <div style="flex:1">
        <div class="stub">
          <div><div class="lbl">Gate</div><div class="val">B4</div></div>
          <div><div class="lbl">Boarding</div><div class="val" style="color:#e8d48b">${boardingStr}</div></div>
          <div><div class="lbl">Class</div><div class="val">${(b.seat_class || "Economy").slice(0, 3).toUpperCase()}</div></div>
          <div><div class="lbl">Flight</div><div class="val">${b.flight_number}</div></div>
          <div><div class="lbl">Duration</div><div class="val">20 min</div></div>
          <div><div class="lbl">Passengers</div><div class="val">${b.passengers}</div></div>
        </div>
        <div class="bid">BOOKING #${b.id} · NPR ${Number(b.total_price).toLocaleString()}</div>
      </div>
    </div>
  </div>
  <script>window.onload=()=>setTimeout(()=>window.print(),500);</script>
  </body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      alert(
        "Popup blocked. Please allow popups to download your boarding pass.",
      );
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const getTravelers = (b) => {
    let d = b.passenger_details;
    if (d == null) {
      return [
        {
          name: b.passenger_name,
          email: b.passenger_email,
          phone: b.passenger_phone,
        },
      ];
    }
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {
        return [
          {
            name: b.passenger_name,
            email: b.passenger_email,
            phone: b.passenger_phone,
          },
        ];
      }
    }
    if (Array.isArray(d) && d.length > 0) return d;
    return [
      {
        name: b.passenger_name,
        email: b.passenger_email,
        phone: b.passenger_phone,
      },
    ];
  };

  const getMySeatIds = (booking) =>
    (booking.seat_assignments || []).map((s) => s.seat_id).filter(Boolean);
  const normalizeSeatClass = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const seatClassLabel = (value) => {
    const normalized = normalizeSeatClass(value);
    if (normalized === "business") return "Business";
    return "Economy";
  };

  const openSwapOptions = async (booking) => {
    try {
      const seats = await flightsAPI.getSeats(booking.flight_id);
      setSwapModal({
        booking,
        seats,
        targetSeatId: null,
      });
    } catch {
      alert("Unable to load available seats right now.");
    }
  };

  const openPeerSwap = async (booking) => {
    try {
      const seats = await flightsAPI.getSeats(booking.flight_id);
      setPeerSwapModal({
        booking,
        seats,
        step: 1,
        fromSeatId: null,
        toSeatId: null,
      });
    } catch {
      alert("Unable to load seat map right now.");
    }
  };

  const handlePeerSeatClick = (seat) => {
    if (!peerSwapModal) return;
    const myIds = getMySeatIds(peerSwapModal.booking);
    const { step, fromSeatId } = peerSwapModal;

    if (step === 1) {
      if (!myIds.includes(seat.id)) {
        alert("First, tap one of your booked seats (highlighted).");
        return;
      }
      setPeerSwapModal((p) =>
        p ? { ...p, step: 2, fromSeatId: seat.id, toSeatId: null } : null,
      );
      return;
    }

    if (myIds.includes(seat.id)) {
      if (seat.id === fromSeatId) {
        setPeerSwapModal((p) =>
          p ? { ...p, step: 1, fromSeatId: null, toSeatId: null } : null,
        );
      } else {
        alert("Choose another passenger's seat, not yours.");
      }
      return;
    }
    if (seat.status !== "booked") {
      alert("Select a seat that is already booked by another passenger.");
      return;
    }
    const fromSeat = peerSwapModal.seats.find((s) => s.id === fromSeatId);
    if (
      fromSeat &&
      normalizeSeatClass(fromSeat.class) !== normalizeSeatClass(seat.class)
    ) {
      alert(
        `Swap is only allowed within the same class. Choose a ${seatClassLabel(fromSeat.class)} seat.`,
      );
      return;
    }
    if (seat.accepts_peer_swap === false) {
      alert("This passenger has chosen not to receive seat swap requests.");
      return;
    }
    setPeerSwapModal((p) => (p ? { ...p, toSeatId: seat.id } : null));
  };

  const submitPeerSwapRequest = async () => {
    if (!peerSwapModal?.fromSeatId || !peerSwapModal?.toSeatId) return;
    const fromSeat = peerSwapModal.seats.find(
      (s) => s.id === peerSwapModal.fromSeatId,
    );
    const toSeat = peerSwapModal.seats.find(
      (s) => s.id === peerSwapModal.toSeatId,
    );
    if (!fromSeat || !toSeat) return;
    if (fromSeat.gender && toSeat.gender && fromSeat.gender !== toSeat.gender) {
      const other = genderLabel(toSeat.gender);
      const msg =
        toSeat.gender === "female"
          ? "You are swapping with a female passenger. Do you want to continue?"
          : "You are swapping with a male passenger. Do you want to continue?";
      if (
        !window.confirm(
          `${msg}\n\nYour seat: ${fromSeat.seat_number} (${genderLabel(fromSeat.gender)}) → Their seat: ${toSeat.seat_number} (${other}).`,
        )
      ) {
        return;
      }
    } else if (!toSeat.gender) {
      const ok = window.confirm(
        `Their seat (${toSeat.seat_number}) has gender hidden on the map. Send the swap request anyway? The system will still match seats using saved passenger data.`,
      );
      if (!ok) return;
    }
    setPeerSubmitting(true);
    try {
      await swapRequestsAPI.create({
        flight_id: peerSwapModal.booking.flight_id,
        requester_seat: peerSwapModal.fromSeatId,
        target_seat: peerSwapModal.toSeatId,
      });
      setPeerSwapModal(null);
      alert(
        "Swap request sent. The other passenger will see it under Pending requests.",
      );
      await refreshDashboard();
    } catch (err) {
      alert(err.message);
    } finally {
      setPeerSubmitting(false);
    }
  };

  const handleSwap = async () => {
    if (!swapModal) return;
    const target = Number(swapModal.targetSeatId);
    const booking = swapModal.booking;
    const currentSeatId = booking.seat_assignments?.[0]?.seat_id;
    if (!target || !currentSeatId) return;
    setSwappingId(booking.id);
    try {
      const response = await seatsAPI.swap({
        bookingId: booking.id,
        fromSeatId: currentSeatId,
        toSeatId: target,
      });
      await refreshDashboard();
      setSwapModal(null);
      alert(response?.message || "Seat moved to the new seat successfully.");
    } catch (err) {
      alert(err.message);
    } finally {
      setSwappingId(null);
    }
  };

  const closeSwapDetail = () => {
    setSwapDetailRequest(null);
    setSwapDetailSeats([]);
    setSwapDetailAcceptError(null);
    setSwapDetailLoading(false);
    setSwapDetailPendingAction(null);
  };

  const openSwapDetail = async (r) => {
    setSwapDetailAcceptError(null);
    setSwapDetailRequest(r);
    setSwapDetailLoading(true);
    setSwapDetailSeats([]);
    try {
      const seats = await flightsAPI.getSeats(r.flight_id);
      setSwapDetailSeats(seats);
    } catch {
      setSwapDetailSeats([]);
      setSwapDetailAcceptError(
        "Unable to load the seat map. Use Refresh map to try again.",
      );
    } finally {
      setSwapDetailLoading(false);
    }
  };

  const refreshSwapDetailSeats = async () => {
    if (!swapDetailRequest) return;
    setSwapDetailLoading(true);
    setSwapDetailAcceptError(null);
    try {
      const seats = await flightsAPI.getSeats(swapDetailRequest.flight_id);
      setSwapDetailSeats(seats);
    } catch {
      setSwapDetailAcceptError("Unable to load the seat map.");
    } finally {
      setSwapDetailLoading(false);
    }
  };

  const refreshOtherModalsSeats = async () => {
    if (swapModal?.booking?.flight_id) {
      try {
        const seats = await flightsAPI.getSeats(swapModal.booking.flight_id);
        setSwapModal((prev) => (prev ? { ...prev, seats } : null));
      } catch {
      }
    }
    if (peerSwapModal?.booking?.flight_id) {
      try {
        const seats = await flightsAPI.getSeats(
          peerSwapModal.booking.flight_id,
        );
        setPeerSwapModal((prev) => (prev ? { ...prev, seats } : null));
      } catch {
      }
    }
  };

  const acceptSwapFromDetail = async (id) => {
    if (!swapDetailRequest || swapDetailRequest.id !== id) return;
    setSwapReqActionId(id);
    setSwapDetailPendingAction("accept");
    setSwapDetailAcceptError(null);
    try {
      const seats = await flightsAPI.getSeats(swapDetailRequest.flight_id);
      setSwapDetailSeats(seats);
      const block = getSwapPreviewBlockReason(
        swapDetailRequest,
        seats,
        user?.id,
      );
      if (block) {
        setSwapDetailAcceptError(block);
        return;
      }
      const response = await swapRequestsAPI.accept(id);
      await refreshDashboard();
      closeSwapDetail();
      await refreshOtherModalsSeats();
      alert(response?.message || "Swap accepted. Seats have been updated.");
    } catch (err) {
      const raw = err?.message || "Could not complete swap.";
      const friendly = /no longer available|not available for swap|409/i.test(
        raw,
      )
        ? "Seat is no longer available for swap."
        : raw;
      setSwapDetailAcceptError(friendly);
      try {
        const seats = await flightsAPI.getSeats(swapDetailRequest.flight_id);
        setSwapDetailSeats(seats);
      } catch {
      }
    } finally {
      setSwapReqActionId(null);
      setSwapDetailPendingAction(null);
    }
  };

  const declineSwapFromDetail = async (id) => {
    setSwapReqActionId(id);
    setSwapDetailPendingAction("decline");
    setSwapDetailAcceptError(null);
    try {
      await swapRequestsAPI.decline(id);
      await refreshDashboard();
      closeSwapDetail();
    } catch (err) {
      alert(err.message);
    } finally {
      setSwapReqActionId(null);
      setSwapDetailPendingAction(null);
    }
  };

  const swapDetailBlockReason =
    swapDetailRequest && user && !swapDetailLoading
      ? getSwapPreviewBlockReason(swapDetailRequest, swapDetailSeats, user.id)
      : null;
  const swapDetailBooking = swapDetailRequest
    ? bookings.find(
        (b) =>
          Number(b.flight_id) === Number(swapDetailRequest.flight_id) &&
          (b.seat_assignments || []).some(
            (s) => Number(s.seat_id) === Number(swapDetailRequest.target_seat),
          ),
      )
    : null;

  if (authLoading) return null;
  if (!user) return null;

  return (
    <div className="mb-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <FlightsHeader activeTab="flights" />

      <div className="mb-content">
        <h1 className="mb-title">My Bookings</h1>
        <p className="mb-intro">
          Cancel online up to 2 hours before departure. Refunds are estimated by
          notice window (48h / 24h / 2h tiers). Airline-cancelled flights need
          support.
        </p>

        {!loading && incomingSwapRequests.length > 0 && (
          <section
            className="mb-pending-swaps"
            aria-labelledby="mb-pending-swaps-title"
          >
            <h2 id="mb-pending-swaps-title" className="mb-pending-swaps-title">
              Pending seat swap requests
            </h2>
            <p className="mb-pending-swaps-hint">
              Someone wants to exchange seats with you. Open a request to see
              the full cabin map, then accept or decline.
            </p>
            <ul className="mb-pending-swaps-list">
              {incomingSwapRequests.map((r) => (
                <li key={r.id} className="mb-swap-request-card">
                  <div className="mb-swap-request-head">
                    <strong>{r.requester_name}</strong>
                    <span className="mb-swap-request-time">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                  <p className="mb-swap-request-route">
                    {r.flight_number} · {r.origin} → {r.destination}
                  </p>
                  <p className="mb-swap-request-seats">
                    Offers <strong>{r.requester_seat_number}</strong>
                    {r.requester_gender
                      ? ` (${genderLabel(r.requester_gender)})`
                      : ""}{" "}
                    for your <strong>{r.target_seat_number}</strong>
                    {r.target_gender
                      ? ` (${genderLabel(r.target_gender)})`
                      : ""}
                  </p>
                  <p className="mb-swap-request-depart">
                    Departs {formatDate(r.departure_time)}
                  </p>
                  <button
                    type="button"
                    className="mb-swap-open-detail"
                    disabled={swapReqActionId === r.id}
                    onClick={() => openSwapDetail(r)}
                  >
                    View seat map & respond
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading ? (
          <p className="mb-loading">Loading your bookings...</p>
        ) : bookings.length === 0 ? (
          <div className="mb-empty">
            <p>You haven't booked any flights yet.</p>
            <button
              className="mb-btn-primary"
              onClick={() => navigate("/flights")}
            >
              Browse Flight Deals
            </button>
          </div>
        ) : (
          <div className="mb-list">
            {bookings.map((b) => {
              const effectiveStatus =
                b.flight_status === "completed" ? "completed" : b.status;
              const airlineCancelled =
                b.flight_status === "cancelled" &&
                (b.status === "confirmed" || b.status === "cancelled");
              const altState = rebookAlts[b.id];
              const bookingAlerts = alertsByFlightId[Number(b.flight_id)] || [];
              return (
                <div
                  className="mb-card-wrap"
                  key={b.id}
                  data-booking-card={b.id}
                >
                  <div className={`mb-card ${effectiveStatus}`}>
                    {airlineCancelled ? (
                      <div className="mb-airline-cancel-banner" role="alert">
                        <strong>Flight cancelled by airline</strong>
                        <p>
                          {b.status === "confirmed"
                            ? "Your booking is still confirmed. We can suggest scheduled flights on the same route near your original departure (within 3 days, still in the future)."
                            : "Your booking was cancelled and any payment was refunded to your wallet. You can still browse other scheduled flights on this route below."}
                        </p>
                        <button
                          type="button"
                          className="mb-find-alts-btn"
                          onClick={() => loadAlternatives(b.id)}
                          disabled={altState?.loading}
                        >
                          {altState?.loading
                            ? "Searching…"
                            : "Find alternative flights"}
                        </button>
                      </div>
                    ) : null}
                    <div
                      className={
                        effectiveStatus === "cancelled"
                          ? "mb-card-content mb-card-content--dimmed"
                          : "mb-card-content"
                      }
                    >
                      <div className="mb-card-top">
                        <div className="mb-route">
                          <span className="mb-city">{b.origin}</span>
                          <span className="mb-arrow">→</span>
                          <span className="mb-city">{b.destination}</span>
                        </div>
                        <span
                          className={`mb-status mb-status-${effectiveStatus}`}
                        >
                          {effectiveStatus}
                        </span>
                      </div>

                      <div className="mb-card-details">
                        <div className="mb-detail">
                          <span className="mb-label">Flight</span>
                          <span className="mb-value">
                            {b.flight_number} · {b.airline}
                          </span>
                          {b.flight_status &&
                            b.flight_status !== "scheduled" && (
                              <span
                                className={`mb-flight-status mb-flight-${b.flight_status}`}
                              >
                                {b.flight_status}
                              </span>
                            )}
                        </div>
                        <div className="mb-detail">
                          <span className="mb-label">Departure</span>
                          <span className="mb-value">
                            {formatDate(b.departure_time)}
                          </span>
                        </div>
                        <div className="mb-detail">
                          <span className="mb-label">Passengers</span>
                          <span className="mb-value">
                            {b.passengers} · {b.seat_class}
                          </span>
                        </div>
                        <div className="mb-detail">
                          <span className="mb-label">Seat</span>
                          <span className="mb-value">
                            {b.seat_assignments?.[0]?.seat_number ||
                              "Not assigned yet"}
                            {b.seat_assignments?.[0]?.gender
                              ? ` · ${genderLabel(b.seat_assignments[0].gender)}`
                              : ""}
                            {b.seat_assignments?.[0]?.gender &&
                            b.seat_assignments[0].show_gender_on_map === false
                              ? " · map: private"
                              : ""}
                            {b.seat_assignments?.[0]?.accept_peer_swap === false
                              ? " · swaps: off"
                              : ""}
                          </span>
                        </div>
                        <div className="mb-detail mb-detail-travelers">
                          <span className="mb-label">Travelers</span>
                          <ul className="mb-traveler-list">
                            {getTravelers(b).map((t, i) => (
                              <li key={i} className="mb-traveler-item">
                                <span className="mb-traveler-name">
                                  {t.name}
                                </span>
                                <span className="mb-traveler-email">
                                  {t.email}
                                </span>
                                {t.phone ? (
                                  <span className="mb-traveler-phone">
                                    {t.phone}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="mb-detail">
                          <span className="mb-label">Total</span>
                          <span className="mb-value mb-price">
                            {formatPrice(b.total_price)}
                          </span>
                        </div>
                      </div>

                      {bookingAlerts.length > 0 && (
                        <div className="mb-alerts-box" role="status">
                          <p className="mb-alerts-title">Flight Alerts</p>
                          <p className="mb-alerts-subtitle">
                            Sent by admin for this flight.
                          </p>
                          <ul className="mb-alerts-list">
                            {bookingAlerts.slice(0, 3).map((n) => (
                              <li key={n.id} className="mb-alert-item">
                                <p className="mb-alert-item-head">
                                  <span
                                    className={`mb-alert-tag mb-alert-tag-${n.type || "info"}`}
                                  >
                                    {alertTypeLabel(n.type)}
                                  </span>
                                  <span className="mb-alert-time">
                                    {formatDate(n.created_at)}
                                  </span>
                                </p>
                                <p className="mb-alert-item-title">{n.title}</p>
                                <p className="mb-alert-item-msg">{n.message}</p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="mb-card-footer mb-card-footer-wrap">
                        <span className="mb-booking-id">Booking #{b.id}</span>
                        <div className="mb-card-footer-btns">
                          {effectiveStatus === "confirmed" && (
                            <button
                              type="button"
                              className="mb-cancel-btn mb-boarding-btn"
                              onClick={() => downloadBoardingPass(b)}
                            >
                              🎫 Boarding Pass
                            </button>
                          )}
                          {effectiveStatus === "confirmed" &&
                            b.seat_assignments?.[0] && (
                              <>
                                <button
                                  type="button"
                                  className="mb-cancel-btn mb-swap-btn"
                                  onClick={() => openSwapOptions(b)}
                                >
                                  Move to empty seat
                                </button>
                                <button
                                  type="button"
                                  className="mb-cancel-btn mb-peer-swap-btn"
                                  onClick={() => openPeerSwap(b)}
                                >
                                  Request swap with passenger
                                </button>
                              </>
                            )}
                          {effectiveStatus === "confirmed" &&
                            b.cancellation?.allowed && (
                              <button
                                type="button"
                                className="mb-cancel-btn"
                                onClick={() => openCancelModal(b)}
                                disabled={cancellingId === b.id}
                              >
                                {cancellingId === b.id
                                  ? "Cancelling..."
                                  : "Cancel booking"}
                              </button>
                            )}
                        </div>
                        {effectiveStatus === "confirmed" &&
                          b.cancellation &&
                          !b.cancellation.allowed && (
                            <span
                              className="mb-cancel-blocked"
                              title={b.cancellation.reason}
                            >
                              Cancellation unavailable
                            </span>
                          )}
                      </div>
                      {effectiveStatus === "confirmed" &&
                        b.cancellation?.allowed && (
                          <p className="mb-policy-hint">
                            {b.cancellation.policy_label}
                            {b.cancellation.hours_until_departure != null && (
                              <span className="mb-policy-time">
                                {" "}
                                ·{" "}
                                {Math.max(
                                  0,
                                  Math.floor(
                                    b.cancellation.hours_until_departure,
                                  ),
                                )}
                                h until departure
                              </span>
                            )}
                          </p>
                        )}
                    </div>
                  </div>

                  {altState && !altState.loading && altState.error ? (
                    <p className="mb-alt-panel-error">{altState.error}</p>
                  ) : null}

                  {altState?.data ? (
                    <div className="mb-alternatives-panel">
                      {altState.data.alternatives?.length === 0 ? (
                        <p className="mb-alt-empty">
                          No alternative flights found on this route (near your
                          original date, or in the next 14 days if that date has
                          passed).
                        </p>
                      ) : (
                        <ul className="mb-alt-list">
                          {altState.data.alternatives.map((f) => (
                            <li key={f.id} className="mb-alt-card">
                              <div className="mb-alt-card-main">
                                <span className="mb-alt-fn">
                                  {f.flight_number}
                                </span>
                                <span className="mb-alt-dt">
                                  {formatDate(f.departure_time)}
                                </span>
                                <span className="mb-alt-meta">
                                  {formatPrice(f.price)} · {f.available_seats}{" "}
                                  seats left
                                </span>
                              </div>
                              <button
                                type="button"
                                className="mb-alt-book"
                                onClick={() =>
                                  navigate(`/flights/book/${f.id}`, {
                                    state: {
                                      passengerFilter: b.passengers,
                                      classFilter: b.seat_class,
                                    },
                                  })
                                }
                              >
                                Book this instead
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cancelModal && cancelModal.cancellation?.allowed && (
        <div
          className="mb-modal-overlay"
          role="presentation"
          onClick={closeCancelModal}
        >
          <div
            className="mb-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-cancel-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mb-cancel-title" className="mb-modal-title">
              Cancel this booking?
            </h2>
            <p className="mb-modal-lead">
              This cannot be undone. Your seats will be returned to inventory.
            </p>

            <div className="mb-modal-trip">
              <div className="mb-modal-route">
                <span>{cancelModal.origin}</span>
                <span className="mb-arrow">→</span>
                <span>{cancelModal.destination}</span>
              </div>
              <p className="mb-modal-meta">
                {cancelModal.flight_number} · {cancelModal.airline} · Departs{" "}
                {formatDate(cancelModal.departure_time)}
              </p>
              <p className="mb-modal-price">
                Paid {formatPrice(cancelModal.total_price)} ·{" "}
                {cancelModal.passengers} passenger(s)
              </p>
            </div>

            <div className="mb-modal-measures">
              <h3 className="mb-modal-sub">Cancellation policy</h3>
              <ul>
                <li>
                  Online cancellation closes <strong>2 hours</strong> before
                  departure.
                </li>
                <li>
                  <strong>48+ hours</strong> before: full refund (estimated).
                </li>
                <li>
                  <strong>24–48 hours</strong> before: 75% refund; 25% fee.
                </li>
                <li>
                  <strong>2–24 hours</strong> before: 50% refund; 50% fee.
                </li>
                <li>
                  Airline-cancelled or completed flights: use support, not this
                  button.
                </li>
              </ul>
            </div>

            <div className="mb-modal-estimate">
              <span className="mb-modal-est-label">
                Applies to your booking
              </span>
              <p className="mb-modal-policy-line">
                {cancelModal.cancellation.policy_label}
              </p>
              <div className="mb-modal-amounts">
                <span>
                  Est. refund{" "}
                  <strong>
                    {formatPrice(cancelModal.cancellation.refund_amount)}
                  </strong>
                </span>
                {cancelModal.cancellation.fee_amount > 0 && (
                  <span>
                    Fee{" "}
                    <strong>
                      {formatPrice(cancelModal.cancellation.fee_amount)}
                    </strong>
                  </span>
                )}
              </div>
            </div>

            <label className="mb-modal-check">
              <input
                type="checkbox"
                checked={policyAck}
                onChange={(e) => setPolicyAck(e.target.checked)}
              />
              <span>
                I understand the refund estimate, fees, and that this action is
                final.
              </span>
            </label>

            <div className="mb-modal-actions">
              <button
                type="button"
                className="mb-modal-back"
                onClick={closeCancelModal}
              >
                Keep booking
              </button>
              <button
                type="button"
                className="mb-modal-confirm"
                onClick={confirmCancel}
                disabled={!policyAck || cancellingId === cancelModal.id}
              >
                {cancellingId === cancelModal.id
                  ? "Cancelling…"
                  : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {swapModal && (
        <div
          className="mb-modal-overlay"
          role="presentation"
          onClick={() => setSwapModal(null)}
        >
          <div
            className="mb-modal mb-swap-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-empty-swap-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mb-empty-swap-title" className="mb-modal-title">
              Move to an empty seat
            </h2>
            <p className="mb-modal-lead">
              Current seat:{" "}
              <strong>
                {swapModal.booking.seat_assignments?.[0]?.seat_number}
              </strong>
              . Tap an available (green) seat in the same class.
            </p>
            {renderSeatMapPricePreview({
              bookingTotal: swapModal.booking.total_price,
              fromSeat: swapModal.seats.find(
                (s) =>
                  Number(s.id) ===
                  Number(swapModal.booking.seat_assignments?.[0]?.seat_id),
              ),
              toSeat: swapModal.seats.find(
                (s) => Number(s.id) === Number(swapModal.targetSeatId),
              ),
            })}
            <AircraftSeatMap
              seats={swapModal.seats}
              selectedSeatIds={
                swapModal.targetSeatId ? [swapModal.targetSeatId] : []
              }
              onToggleSeat={(seat) => {
                if (seat.status !== "available") return;
                const currentSeat = swapModal.seats.find(
                  (s) =>
                    Number(s.id) ===
                    Number(swapModal.booking.seat_assignments?.[0]?.seat_id),
                );
                if (
                  currentSeat &&
                  normalizeSeatClass(currentSeat.class) !==
                    normalizeSeatClass(seat.class)
                ) {
                  alert(
                    `Move is only allowed within the same class. Choose a ${seatClassLabel(currentSeat.class)} seat.`,
                  );
                  return;
                }
                setSwapModal((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    targetSeatId:
                      prev.targetSeatId === seat.id ? null : seat.id,
                  };
                });
              }}
            />
            <div className="mb-modal-actions">
              <button
                type="button"
                className="mb-modal-back"
                onClick={() => setSwapModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-modal-confirm"
                onClick={handleSwap}
                disabled={
                  swappingId === swapModal.booking.id || !swapModal.targetSeatId
                }
              >
                {swappingId === swapModal.booking.id
                  ? "Moving…"
                  : "Confirm move"}
              </button>
            </div>
          </div>
        </div>
      )}

      {swapDetailRequest && (
        <SwapRequestModal
          request={swapDetailRequest}
          booking={swapDetailBooking}
          seats={swapDetailSeats}
          seatsLoading={swapDetailLoading}
          acceptBlockReason={swapDetailBlockReason}
          acceptError={swapDetailAcceptError}
          onClose={closeSwapDetail}
          onRefreshSeats={refreshSwapDetailSeats}
          onAccept={acceptSwapFromDetail}
          onDecline={declineSwapFromDetail}
          actionLoadingId={swapReqActionId}
          pendingAction={swapDetailPendingAction}
        />
      )}

      {peerSwapModal && (
        <div
          className="mb-modal-overlay"
          role="presentation"
          onClick={() => setPeerSwapModal(null)}
        >
          <div
            className="mb-modal mb-swap-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mb-peer-swap-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="mb-peer-swap-title" className="mb-modal-title">
              Request swap with another passenger
            </h2>
            <p className="mb-modal-lead">
              {peerSwapModal.step === 1
                ? "Step 1: Tap one of your seats (blue)."
                : "Step 2: Tap another passenger's booked seat in the same class. Colors show gender when that traveler allows it on the map."}
            </p>
            {renderSeatMapPricePreview({
              bookingTotal: peerSwapModal.booking.total_price,
              fromSeat: peerSwapModal.seats.find(
                (s) => Number(s.id) === Number(peerSwapModal.fromSeatId),
              ),
              toSeat: peerSwapModal.seats.find(
                (s) => Number(s.id) === Number(peerSwapModal.toSeatId),
              ),
            })}
            {peerSwapModal.step === 2 &&
              peerSwapModal.fromSeatId &&
              peerSwapModal.toSeatId && (
                <p className="mb-peer-swap-summary">
                  {(() => {
                    const a = peerSwapModal.seats.find(
                      (s) => s.id === peerSwapModal.fromSeatId,
                    );
                    const t = peerSwapModal.seats.find(
                      (s) => s.id === peerSwapModal.toSeatId,
                    );
                    if (!a || !t) return null;
                    return (
                      <>
                        Request: <strong>{a.seat_number}</strong>
                        {a.gender ? ` (${genderLabel(a.gender)})` : ""} ↔{" "}
                        <strong>{t.seat_number}</strong>
                        {t.gender ? ` (${genderLabel(t.gender)})` : ""}
                      </>
                    );
                  })()}
                </p>
              )}
            <AircraftSeatMap
              mode="peerSwap"
              seats={peerSwapModal.seats}
              selectedSeatIds={[]}
              mySeatIds={getMySeatIds(peerSwapModal.booking)}
              peerSelectedIds={[
                peerSwapModal.fromSeatId,
                peerSwapModal.toSeatId,
              ].filter(Boolean)}
              onToggleSeat={() => {}}
              onPeerSwapSeatClick={handlePeerSeatClick}
            />
            <div className="mb-modal-actions mb-modal-actions-stack">
              <button
                type="button"
                className="mb-modal-back"
                onClick={() => setPeerSwapModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mb-modal-confirm mb-peer-submit"
                onClick={submitPeerSwapRequest}
                disabled={
                  peerSubmitting ||
                  !peerSwapModal.fromSeatId ||
                  !peerSwapModal.toSeatId
                }
              >
                {peerSubmitting ? "Sending…" : "Send swap request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyBookings;
