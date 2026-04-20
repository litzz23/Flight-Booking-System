import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import {
  flights as flightsAPI,
  bookings as bookingsAPI,
  seats as seatsAPI,
  predictions as predictionsAPI,
} from "../api";
import { CABIN_CLASSES } from "../flightConstants";
import { formatFlightDuration } from "../utils/flightTime";
import FlightsHeader from "./flights/FlightsHeader";
import FlightsFilterBar from "./flights/FlightsFilterBar";
import AircraftSeatMap from "./AircraftSeatMap";
import cloudsBg from "../assets/clouds-bg.png";
import "./FlightDeals.css";

function BookFlightPage() {
  const { flightId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const passed = location.state || {};

  const [flight, setFlight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [meta, setMeta] = useState({
    origins: [],
    destinations: [],
    airlines: [],
  });

  const [tripType, setTripType] = useState(passed.tripType || "One way");
  const [passengerFilter, setPassengerFilter] = useState(
    passed.passengerFilter || 1,
  );
  const [classFilter, setClassFilter] = useState(
    passed.classFilter || "Economy",
  );
  const [stopsFilter, setStopsFilter] = useState(passed.stopsFilter || "Any");
  const [airlineFilter, setAirlineFilter] = useState(
    passed.airlineFilter || "All",
  );
  const [maxPrice, setMaxPrice] = useState(100000);
  const [maxDuration, setMaxDuration] = useState(180);
  const [activeDropdown, setActiveDropdown] = useState(null);

  const [bookingForm, setBookingForm] = useState({
    passengers: passed.passengerFilter || 1,
  });
  /** One row per traveler: name, email, phone */
  const [passengerRows, setPassengerRows] = useState([
    {
      name: "",
      email: "",
      phone: "",
      gender: "male",
      seatClass: passed.classFilter || "Economy",
      showGenderOnMap: true,
      acceptPeerSwap: true,
    },
  ]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState("");
  const [hasExistingBookingOnFlight, setHasExistingBookingOnFlight] =
    useState(false);
  const [existingBookedPassengerCount, setExistingBookedPassengerCount] =
    useState(0);
  const [existingBookedPassengerKeys, setExistingBookedPassengerKeys] =
    useState(new Set());
  const [allSeats, setAllSeats] = useState([]);
  const [seatAssignments, setSeatAssignments] = useState([]);
  const [seatModalTravelerIndex, setSeatModalTravelerIndex] = useState(null);
  const [priceInsight, setPriceInsight] = useState(null);
  const [cancellationRisk, setCancellationRisk] = useState(null);
  const [disruptionHover, setDisruptionHover] = useState(false);
  const [disruptionPinned, setDisruptionPinned] = useState(false);
  const disruptionWrapRef = useRef(null);

  useEffect(() => {
    flightsAPI
      .getMeta()
      .then(setMeta)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { state: { from: `/flights/book/${flightId}` } });
      return;
    }
    setLoading(true);
    setLoadError("");
    flightsAPI
      .getById(flightId)
      .then(setFlight)
      .catch(() => setLoadError("Flight not found or unavailable."))
      .finally(() => setLoading(false));
  }, [flightId, user, authLoading, navigate]);

  useEffect(() => {
    setBookingForm((prev) => ({
      ...prev,
      passengers: passengerFilter,
    }));
  }, [passengerFilter]);

  useEffect(() => {
    const n = Math.max(1, Number(bookingForm.passengers) || 1);
    setPassengerRows((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push({
          name: "",
          email: "",
          phone: "",
          gender: "male",
          seatClass: classFilter || "Economy",
          showGenderOnMap: true,
          acceptPeerSwap: true,
        });
      }
      return next;
    });
  }, [bookingForm.passengers, classFilter]);

  useEffect(() => {
    if (!flight || !user) return;
    if (hasExistingBookingOnFlight) return;
    setPassengerRows((prev) => {
      if (prev.length === 0) {
        return [
          {
            name: user.name || "",
            email: user.email || "",
            phone: user.phone || "",
            gender: "male",
            seatClass: classFilter || "Economy",
            showGenderOnMap: true,
            acceptPeerSwap: true,
          },
        ];
      }
      const p0 = prev[0];
      if (p0.name || p0.email) return prev;
      const copy = [...prev];
      copy[0] = {
        ...copy[0],
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
      };
      return copy;
    });
  }, [flight, user, hasExistingBookingOnFlight]);

  useEffect(() => {
    if (!flight?.id) return;
    flightsAPI
      .getSeats(flight.id)
      .then(setAllSeats)
      .catch(() => setAllSeats([]));
  }, [flight?.id]);

  useEffect(() => {
    if (!flight?.id || !user?.id) {
      setHasExistingBookingOnFlight(false);
      setExistingBookedPassengerCount(0);
      setExistingBookedPassengerKeys(new Set());
      return;
    }

    const identityKey = (name, email) =>
      `${String(name || "")
        .trim()
        .toLowerCase()}|${String(email || "")
        .trim()
        .toLowerCase()}`;

    const extractKeysFromBooking = (booking) => {
      const out = new Set();
      const add = (name, email) => {
        const k = identityKey(name, email);
        if (k !== "|") out.add(k);
      };

      let details = booking?.passenger_details;
      if (typeof details === "string") {
        try {
          details = JSON.parse(details);
        } catch {
          details = null;
        }
      }

      if (Array.isArray(details) && details.length > 0) {
        details.forEach((p) => add(p?.name, p?.email));
      } else {
        add(booking?.passenger_name, booking?.passenger_email);
      }

      return out;
    };

    let cancelled = false;
    bookingsAPI
      .getAll()
      .then((rows) => {
        if (cancelled) return;
        const sameFlightBookings = (rows || []).filter(
          (b) =>
            Number(b.flight_id) === Number(flight.id) &&
            b.status !== "cancelled",
        );

        setHasExistingBookingOnFlight(sameFlightBookings.length > 0);

        const keys = new Set();
        sameFlightBookings.forEach((b) => {
          extractKeysFromBooking(b).forEach((k) => keys.add(k));
        });
        setExistingBookedPassengerCount(keys.size);
        setExistingBookedPassengerKeys(keys);
      })
      .catch(() => {
        if (cancelled) return;
        setHasExistingBookingOnFlight(false);
        setExistingBookedPassengerCount(0);
        setExistingBookedPassengerKeys(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [flight?.id, user?.id]);

  useEffect(() => {
    if (!hasExistingBookingOnFlight || !user) return;
    setPassengerRows((prev) => {
      if (!prev.length) return prev;
      const first = prev[0] || {};
      const sameUserIdentity =
        String(first.name || "")
          .trim()
          .toLowerCase() ===
          String(user.name || "")
            .trim()
            .toLowerCase() ||
        String(first.email || "")
          .trim()
          .toLowerCase() ===
          String(user.email || "")
            .trim()
            .toLowerCase();

      if (!sameUserIdentity) return prev;
      const next = [...prev];
      next[0] = {
        ...next[0],
        name: "",
        email: "",
        phone: "",
      };
      return next;
    });
  }, [hasExistingBookingOnFlight, user]);

  useEffect(() => {
    if (!flight?.id) {
      setPriceInsight(null);
      setCancellationRisk(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      predictionsAPI.getPrice(flight.id).catch(() => null),
      predictionsAPI.getCancellationRisk(flight.id).catch(() => null),
    ]).then(([priceData, riskData]) => {
      if (cancelled) return;
      setPriceInsight(priceData);
      setCancellationRisk(riskData);
    });
    return () => {
      cancelled = true;
    };
  }, [flight?.id]);

  useEffect(() => {
    setDisruptionPinned(false);
    setDisruptionHover(false);
  }, [flight?.id]);

  useEffect(() => {
    if (!disruptionPinned) return;
    const onDoc = (e) => {
      if (
        disruptionWrapRef.current &&
        !disruptionWrapRef.current.contains(e.target)
      ) {
        setDisruptionPinned(false);
      }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [disruptionPinned]);

  useEffect(() => {
    const needed = Number(bookingForm.passengers) || 1;
    setSeatAssignments((prev) => {
      const next = prev.slice(0, needed);
      while (next.length < needed) next.push(null);
      return next;
    });
  }, [bookingForm.passengers]);

  const normalizeClass = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();

  const updatePassenger = (index, field, value) => {
    setPassengerRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });

    if (field === "seatClass") {
      setSeatAssignments((prev) => {
        const seatId = prev[index];
        if (!seatId) return prev;
        const seat = allSeats.find((s) => Number(s.id) === Number(seatId));
        if (!seat) return prev;
        if (normalizeClass(seat.class) === normalizeClass(value)) return prev;
        const next = [...prev];
        next[index] = null;
        return next;
      });
    }
  };

  useEffect(() => {
    const close = () => setActiveDropdown(null);
    if (activeDropdown) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [activeDropdown]);

  const hasActiveFilters =
    passengerFilter > 1 ||
    classFilter !== "Economy" ||
    airlineFilter !== "All" ||
    maxPrice < 100000 ||
    maxDuration < 180;

  const formatPrice = (num) => "NPR " + Number(num).toLocaleString();

  const selectedSeatDetails = useMemo(() => {
    if (!Array.isArray(allSeats) || allSeats.length === 0) return [];
    const byId = new Map(allSeats.map((s) => [Number(s.id), s]));
    return seatAssignments
      .map((id, travelerIndex) => {
        const seat = byId.get(Number(id));
        if (!seat) return null;
        return { ...seat, travelerIndex };
      })
      .filter(Boolean);
  }, [allSeats, seatAssignments]);

  const seatInventory = useMemo(() => {
    if (!flight) return { left: 0, total: 0 };
    const totalFromFlight = Number(flight.total_seats);
    const totalFromRows =
      allSeats.length > 0
        ? allSeats.length
        : Number.isFinite(totalFromFlight) && totalFromFlight > 0
          ? totalFromFlight
          : 0;
    if (allSeats.length > 0) {
      const avail = allSeats.filter((s) => s.status === "available").length;
      return { left: avail, total: totalFromRows };
    }
    return {
      left: Number(flight.available_seats ?? 0),
      total: totalFromRows,
    };
  }, [flight, allSeats]);

  const tripSummary = flight
    ? `${flight.origin} → ${flight.destination} · ${new Date(flight.departure_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
    : "";

  const seatSelectionTotal = selectedSeatDetails.reduce(
    (sum, seat) => sum + Number(seat.price || 0),
    0,
  );
  const totalDue =
    selectedSeatDetails.length === Number(bookingForm.passengers)
      ? seatSelectionTotal
      : flight != null
        ? Number(flight.price) * Number(bookingForm.passengers)
        : 0;
  const displayedPassengerCount =
    existingBookedPassengerCount + Number(bookingForm.passengers || 1);
  const walletBal = Number(user?.wallet_balance ?? 0);
  const canPay = Math.round(walletBal * 100) >= Math.round(totalDue * 100);

  const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
  const normalizePhone = (value) => {
    const raw = String(value || "").trim();
    const hasPlus = raw.startsWith("+");
    const digits = raw.replace(/\D/g, "");
    return `${hasPlus ? "+" : ""}${digits}`;
  };
  const phoneOk = (value) => {
    const phone = normalizePhone(value);
    // Supports local mobile format and +977-prefixed equivalent.
    return /^9\d{9}$/.test(phone) || /^\+9779\d{9}$/.test(phone);
  };
  const passengerIdentityKey = (name, email) =>
    `${String(name || "")
      .trim()
      .toLowerCase()}|${String(email || "")
      .trim()
      .toLowerCase()}`;

  const handleBook = async (e) => {
    e.preventDefault();
    if (!flight) return;
    const n = Math.max(1, Number(bookingForm.passengers) || 1);
    const seatIds = seatAssignments
      .slice(0, n)
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const passenger_details = passengerRows.slice(0, n).map((p, idx) => ({
      name: p.name.trim(),
      email: p.email.trim(),
      phone: normalizePhone(p.phone),
      seat_class: p.seatClass || "Economy",
      is_guest: hasExistingBookingOnFlight || idx > 0,
    }));

    for (let i = 0; i < n; i++) {
      const p = passenger_details[i];
      if (!p || !p.name || !p.email) {
        setBookingError(`Enter full name and email for passenger ${i + 1}.`);
        return;
      }
      if (!p.phone) {
        setBookingError(`Enter mobile number for passenger ${i + 1}.`);
        return;
      }
      if (!phoneOk(p.phone)) {
        setBookingError(
          `Passenger ${i + 1}: enter a valid Nepal mobile number (98XXXXXXXX or +97798XXXXXXXX).`,
        );
        return;
      }
      if (!emailOk(p.email)) {
        setBookingError(`Passenger ${i + 1}: enter a valid email address.`);
        return;
      }

      const key = passengerIdentityKey(p.name, p.email);
      if (existingBookedPassengerKeys.has(key)) {
        setBookingError(
          `Passenger ${i + 1} is already booked on this flight. Please add another passenger.`,
        );
        return;
      }
    }

    const seenInForm = new Set();
    for (let i = 0; i < n; i++) {
      const p = passenger_details[i];
      const key = passengerIdentityKey(p.name, p.email);
      if (seenInForm.has(key)) {
        setBookingError(
          `Passenger ${i + 1} duplicates another passenger in this booking.`,
        );
        return;
      }
      seenInForm.add(key);
    }

    setBookingLoading(true);
    setBookingError("");
    try {
      if (seatIds.length !== n) {
        setBookingError(`Please select exactly ${n} seat(s).`);
        return;
      }

      const uniqueSeatCount = new Set(seatIds).size;
      if (uniqueSeatCount !== n) {
        setBookingError("Each traveler must have a different seat.");
        return;
      }

      await seatsAPI.lock(seatIds);

      const seatById = new Map(allSeats.map((s) => [Number(s.id), s]));
      for (let i = 0; i < n; i++) {
        const seat = seatById.get(Number(seatIds[i]));
        const travelerClass = normalizeClass(passenger_details[i].seat_class);
        const seatClass = normalizeClass(seat?.class);
        if (!seat || seatClass !== travelerClass) {
          setBookingError(
            `Traveler ${i + 1}: selected seat class does not match chosen class.`,
          );
          return;
        }
      }

      const primary = passenger_details[0];
      const firstSeat = seatById.get(Number(seatIds[0]));
      const bookingSeatClass =
        normalizeClass(firstSeat?.class) === "business"
          ? "Business"
          : "Economy";
      const result = await bookingsAPI.create({
        flight_id: flight.id,
        passengers: bookingForm.passengers,
        seat_class: bookingSeatClass,
        seatIds,
        passenger_name: primary.name,
        passenger_email: primary.email,
        passenger_phone: primary.phone,
        passenger_details,
      });
      await bookingsAPI.confirmSeats(result.id, {
        seatIds,
        passengerNames: passenger_details.map((p) => p.name),
        passengerGenders: passengerRows
          .slice(0, n)
          .map((row) => row.gender || "male"),
        passengerShowGenderOnMap: passengerRows
          .slice(0, n)
          .map((row) => row.showGenderOnMap !== false),
        passengerAcceptPeerSwap: passengerRows
          .slice(0, n)
          .map((row) => row.acceptPeerSwap !== false),
      });
      setBookingSuccess(result);
      await refreshUser();
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="fd-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
        <FlightsHeader />
        <div className="fd-loading" style={{ paddingTop: 80 }}>
          <div className="fd-spinner" />
          Loading…
        </div>
      </div>
    );
  }

  if (loadError || !flight) {
    return (
      <div className="fd-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
        <FlightsHeader />
        <div className="fd-content fd-book-content">
          <div className="fd-no-results">
            <p>{loadError || "Flight not found."}</p>
            <button
              type="button"
              className="fd-btn-secondary"
              onClick={() => navigate("/flights")}
            >
              Back to Flight Deals
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fd-page" style={{ backgroundImage: `url(${cloudsBg})` }}>
      <FlightsHeader />

      <div className="fd-hero fd-book-hero">
        <div className="fd-hero-bg">
          <svg
            className="fd-mountains"
            viewBox="0 0 1200 200"
            preserveAspectRatio="none"
          >
            <path
              d="M0 200 L0 140 L80 80 L130 120 L200 60 L280 110 L340 50 L400 100 L450 70 L520 130 L600 40 L680 100 L740 60 L800 90 L860 55 L920 100 L980 70 L1050 110 L1120 65 L1200 120 L1200 200 Z"
              fill="rgba(255,255,255,0.04)"
            />
            <path
              d="M0 200 L0 160 L100 120 L180 150 L260 100 L350 140 L420 90 L500 130 L580 80 L660 120 L740 95 L820 130 L900 100 L980 140 L1060 110 L1140 145 L1200 130 L1200 200 Z"
              fill="rgba(255,255,255,0.06)"
            />
          </svg>
          <svg
            className="fd-airplane"
            viewBox="0 0 60 20"
            fill="rgba(255,255,255,0.25)"
          >
            <path d="M55 10 L40 8 L25 2 L23 4 L35 9 L10 7 L8 9 L30 12 L25 16 L28 16 L35 12 L40 12 L55 10Z" />
          </svg>
        </div>
        <p className="fd-hero-sub fd-book-breadcrumb">
          <button
            type="button"
            className="fd-back-link"
            onClick={() => navigate("/flights")}
          >
            ← Flight Deals
          </button>
        </p>
        <h1 className="fd-hero-title">Complete your booking</h1>
        <div className="fd-search-bar fd-search-bar-trip">
          <svg
            className="fd-search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            readOnly
            value={tripSummary}
            aria-label="Trip summary"
          />
        </div>
        <p className="fd-hero-origin fd-book-sub">
          <span className="fd-origin-label">Trip type</span>
          <strong>{tripType}</strong>
          <span className="fd-origin-sep">·</span>
          <span className="fd-origin-label">from</span>
          <strong>{flight.origin}</strong>
        </p>

        <FlightsFilterBar
          onAllFilters={() => navigate("/flights")}
          hasActiveFilters={hasActiveFilters}
          tripType={tripType}
          setTripType={setTripType}
          passengerFilter={passengerFilter}
          setPassengerFilter={setPassengerFilter}
          classFilter={classFilter}
          setClassFilter={setClassFilter}
          stopsFilter={stopsFilter}
          setStopsFilter={setStopsFilter}
          airlineFilter={airlineFilter}
          setAirlineFilter={setAirlineFilter}
          maxPrice={maxPrice}
          setMaxPrice={setMaxPrice}
          maxDuration={maxDuration}
          setMaxDuration={setMaxDuration}
          activeDropdown={activeDropdown}
          setActiveDropdown={setActiveDropdown}
          meta={meta}
        />
      </div>

      <div className="fd-content fd-book-content">
        {bookingSuccess ? (
          <div className="fd-book-success-panel">
            <div className="fd-booking-success">
              <div className="fd-success-icon">✓</div>
              <h2>Booking Confirmed!</h2>
              <p>
                Flight <strong>{flight.flight_number}</strong>
              </p>
              <p>
                {flight.origin} → {flight.destination}
              </p>
              <p className="fd-success-price">
                {formatPrice(bookingSuccess.total_price)}
              </p>
              <p className="fd-success-sub">Booking ID: #{bookingSuccess.id}</p>
              <div className="fd-success-actions">
                <button
                  type="button"
                  className="fd-btn-primary"
                  onClick={() => navigate("/bookings")}
                >
                  View My Bookings
                </button>
                <button
                  type="button"
                  className="fd-btn-secondary"
                  onClick={() => navigate("/flights")}
                >
                  Back to deals
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="fd-book-layout">
            <aside className="fd-book-summary">
              <div
                className="fd-book-card-image"
                style={{ backgroundImage: `url(${flight.image_url})` }}
              >
                <div className="fd-book-card-overlay">
                  <h2>{flight.destination}</h2>
                  <p>{flight.tagline}</p>
                </div>
              </div>
              <div className="fd-book-card-meta">
                <div className="fd-book-route-risk-row">
                  <div className="fd-modal-route fd-book-route">
                    <div className="fd-route-point">
                      <span className="fd-route-city">{flight.origin}</span>
                      <span className="fd-route-time">
                        {new Date(flight.departure_time).toLocaleString()}
                      </span>
                    </div>
                    <div className="fd-route-arrow">
                      <div className="fd-route-line" />
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="#8ab4f8"
                      >
                        <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                      </svg>
                      <div className="fd-route-line" />
                    </div>
                    <div className="fd-route-point">
                      <span className="fd-route-city">
                        {flight.destination}
                      </span>
                      <span className="fd-route-time">
                        {new Date(flight.arrival_time).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {cancellationRisk && (
                    <div
                      ref={disruptionWrapRef}
                      className="fd-disruption-risk"
                      onMouseEnter={() => setDisruptionHover(true)}
                      onMouseLeave={() => setDisruptionHover(false)}
                    >
                      <span className="fd-disruption-risk-heading">
                        Disruption Risk
                      </span>
                      <button
                        type="button"
                        className={`fd-disruption-risk-badge fd-disruption-risk-badge--${cancellationRisk.color}`}
                        aria-expanded={disruptionPinned}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDisruptionPinned((p) => !p);
                        }}
                      >
                        {cancellationRisk.label}
                      </button>
                      <p className="fd-disruption-risk-advice">
                        {cancellationRisk.advice}
                      </p>
                      {(disruptionHover || disruptionPinned) &&
                        cancellationRisk.factors?.length > 0 && (
                          <div
                            className="fd-disruption-risk-factors"
                            role="region"
                            aria-label="Risk factors"
                          >
                            <p className="fd-disruption-risk-factors-title">
                              Factors
                            </p>
                            <ul className="fd-disruption-risk-factors-list">
                              {cancellationRisk.factors.map((f, i) => (
                                <li key={i}>{f}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}
                </div>
                <div
                  className="fd-book-flight-meta"
                  aria-label="Flight summary"
                >
                  <span className="fd-book-flight-meta-chip fd-book-flight-meta-chip-code">
                    {flight.flight_number}
                  </span>
                  <span className="fd-book-flight-meta-chip">
                    {flight.airline}
                  </span>
                  <span className="fd-book-flight-meta-chip">
                    {flight.origin} → {flight.destination} ·{" "}
                    {formatFlightDuration(
                      flight.departure_time,
                      flight.arrival_time,
                    )}
                  </span>
                  <span className="fd-book-flight-meta-chip fd-book-flight-meta-chip-seats">
                    {seatInventory.total > 0
                      ? `${seatInventory.left} of ${seatInventory.total} seats left`
                      : `${seatInventory.left} seats left`}
                  </span>
                </div>
                <div className="fd-book-price-row">
                  <span className="fd-price-current">
                    {formatPrice(flight.price)}
                  </span>
                  <span className="fd-price-label">per person</span>
                </div>
                {priceInsight && (
                  <div className="fd-price-insight">
                    <p className="fd-price-insight-title">Price Insight</p>
                    <div className="fd-price-insight-row">
                      <span
                        className="fd-price-insight-trend"
                        aria-label={
                          priceInsight.predicted_price >
                          priceInsight.current_price
                            ? "Predicted price higher than current"
                            : "Predicted price lower than or equal to current"
                        }
                      >
                        <span
                          className="fd-price-insight-arrow"
                          aria-hidden="true"
                        >
                          {priceInsight.predicted_price >
                          priceInsight.current_price
                            ? "↑"
                            : "↓"}
                        </span>
                        <span className="fd-price-insight-predicted">
                          {formatPrice(priceInsight.predicted_price)}
                        </span>
                      </span>
                      <span
                        className={`fd-price-insight-demand fd-price-insight-demand--${priceInsight.demand_level}`}
                      >
                        {priceInsight.demand_level === "low"
                          ? "Low demand"
                          : priceInsight.demand_level === "medium"
                            ? "Medium demand"
                            : "High demand"}
                      </span>
                    </div>
                    <p className="fd-price-insight-advice">
                      {priceInsight.advice}
                    </p>
                  </div>
                )}
              </div>
            </aside>
            <main className="fd-book-main">
              <div className="fd-book-main-head">
                <h2 className="fd-book-form-title">Passenger details</h2>
                <p className="fd-book-passenger-intro">
                  {bookingForm.passengers > 1
                    ? "Each traveler needs a unique email where we can send the itinerary."
                    : "We’ll send your itinerary and updates to the email below."}
                </p>
              </div>
              <form
                className="fd-book-form fd-book-form-page"
                onSubmit={handleBook}
              >
                {bookingError && (
                  <div className="fd-book-error fd-modal-error">
                    {bookingError}
                  </div>
                )}
                <div className="fd-book-options-strip">
                  <div className="fd-form-row fd-form-row-passcount">
                    <div className="fd-form-field">
                      <label>Number of passengers</label>
                      <select
                        value={bookingForm.passengers}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            passengers: Number(e.target.value),
                          })
                        }
                      >
                        {Array.from(
                          {
                            length: Math.min(
                              5,
                              Math.max(
                                1,
                                allSeats.length > 0
                                  ? seatInventory.left
                                  : Number(flight.available_seats ?? 0),
                              ),
                            ),
                          },
                          (_, i) => i + 1,
                        ).map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="fd-book-passengers-section">
                  <h3 className="fd-book-passengers-heading">
                    Traveler information
                    {(bookingForm.passengers > 1 ||
                      existingBookedPassengerCount > 0) && (
                      <span className="fd-book-passengers-count">
                        {displayedPassengerCount} people
                      </span>
                    )}
                  </h3>
                  {hasExistingBookingOnFlight && (
                    <p
                      className="fd-book-passenger-intro"
                      style={{ marginBottom: 12 }}
                    >
                      You already booked this flight. Passenger 1 is not
                      auto-added. Enter only new traveler details (this will be
                      traveler {existingBookedPassengerCount + 1}).
                    </p>
                  )}
                  <div className="fd-book-passenger-stack">
                    {passengerRows.map((row, index) => (
                      <div className="fd-passenger-card" key={index}>
                        <div className="fd-passenger-card-head">
                          <span className="fd-passenger-num" aria-hidden="true">
                            {existingBookedPassengerCount + index + 1}
                          </span>
                          <div className="fd-passenger-card-titles">
                            <h4 className="fd-passenger-card-title">
                              Traveler{" "}
                              {existingBookedPassengerCount + index + 1}
                            </h4>
                            {index === 0 && !hasExistingBookingOnFlight ? (
                              <span className="fd-passenger-badge">
                                Primary contact · tickets & updates
                              </span>
                            ) : (
                              <span className="fd-passenger-badge fd-passenger-badge-muted">
                                Guest traveler
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="fd-form-row fd-passenger-fields-row">
                          <div className="fd-form-field">
                            <label htmlFor={`pax-name-${index}`}>
                              Full name
                            </label>
                            <span className="fd-field-hint">
                              As on ID or passport
                            </span>
                            <input
                              id={`pax-name-${index}`}
                              type="text"
                              value={row.name}
                              onChange={(e) =>
                                updatePassenger(index, "name", e.target.value)
                              }
                              placeholder="e.g. Elon Musk"
                              required
                              autoComplete={`section-pax-${index} name`}
                            />
                          </div>
                          <div className="fd-form-field">
                            <label htmlFor={`pax-email-${index}`}>Email</label>
                            <span className="fd-field-hint">
                              Itinerary & updates
                            </span>
                            <input
                              id={`pax-email-${index}`}
                              type="email"
                              value={row.email}
                              onChange={(e) =>
                                updatePassenger(index, "email", e.target.value)
                              }
                              placeholder="name@example.com"
                              required
                              autoComplete={`section-pax-${index} email`}
                            />
                          </div>
                        </div>

                        <div className="fd-form-row fd-passenger-contact-row">
                          <div className="fd-form-field fd-passenger-phone-field">
                            <label htmlFor={`pax-phone-${index}`}>
                              Mobile number
                            </label>
                            <span className="fd-field-hint">
                              10 digits (98XXXXXXXX)
                            </span>
                            <input
                              id={`pax-phone-${index}`}
                              type="tel"
                              value={row.phone}
                              required
                              onChange={(e) =>
                                updatePassenger(
                                  index,
                                  "phone",
                                  e.target.value
                                    .replace(/[^\d+\s-]/g, "")
                                    .replace(/(?!^)\+/g, ""),
                                )
                              }
                              inputMode="numeric"
                              maxLength={14}
                              placeholder="98XXXXXXXX"
                              autoComplete={`section-pax-${index} tel`}
                            />
                          </div>

                          <div className="fd-form-field fd-passenger-gender-field">
                            <label htmlFor={`pax-gender-${index}`}>
                              Gender
                            </label>
                            <span className="fd-field-hint">
                              For seating assignment
                            </span>
                            <select
                              id={`pax-gender-${index}`}
                              value={row.gender || "male"}
                              onChange={(e) =>
                                updatePassenger(index, "gender", e.target.value)
                              }
                            >
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </select>
                          </div>
                        </div>

                        <div className="fd-form-row fd-passenger-contact-row">
                          <div className="fd-form-field">
                            <label htmlFor={`pax-class-${index}`}>Class</label>
                            <span className="fd-field-hint">
                              Seat must match this class
                            </span>
                            <select
                              id={`pax-class-${index}`}
                              value={row.seatClass || "Economy"}
                              onChange={(e) =>
                                updatePassenger(
                                  index,
                                  "seatClass",
                                  e.target.value,
                                )
                              }
                            >
                              {CABIN_CLASSES.map((c) => (
                                <option key={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                          <div className="fd-form-field">
                            <label>Seat</label>
                            <span className="fd-field-hint">Choose a seat</span>
                            <div className="fd-seat-picker-row">
                              <button
                                type="button"
                                className="fd-seat-picker-btn"
                                onClick={() => setSeatModalTravelerIndex(index)}
                              >
                                {seatAssignments[index]
                                  ? "Change seat"
                                  : "Choose seat"}
                              </button>
                              <span className="fd-seat-picker-chip">
                                {(() => {
                                  const seat = allSeats.find(
                                    (s) =>
                                      Number(s.id) ===
                                      Number(seatAssignments[index]),
                                  );
                                  return seat
                                    ? `Seat ${seat.seat_number}`
                                    : "Not selected";
                                })()}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="fd-passenger-privacy-panel">
                          <div className="fd-passenger-privacy-panel-intro">
                            <span className="fd-passenger-privacy-kicker">
                              Sharing
                            </span>
                            <p className="fd-passenger-privacy-lead">
                              Control what other travelers on this flight can
                              see or do.
                            </p>
                          </div>
                          <ul className="fd-passenger-privacy-rows">
                            <li>
                              <label className="fd-passenger-privacy-row">
                                <span className="fd-passenger-privacy-row-text">
                                  <span className="fd-passenger-privacy-row-title">
                                    Gender on the seat map
                                  </span>
                                  <span className="fd-passenger-privacy-row-desc">
                                    Show M/F on the shared cabin map and in swap
                                    messages
                                  </span>
                                </span>
                                <input
                                  className="fd-passenger-privacy-input"
                                  type="checkbox"
                                  checked={row.showGenderOnMap !== false}
                                  onChange={(e) =>
                                    updatePassenger(
                                      index,
                                      "showGenderOnMap",
                                      e.target.checked,
                                    )
                                  }
                                />
                              </label>
                            </li>
                            <li>
                              <label className="fd-passenger-privacy-row">
                                <span className="fd-passenger-privacy-row-text">
                                  <span className="fd-passenger-privacy-row-title">
                                    Seat swap requests
                                  </span>
                                  <span className="fd-passenger-privacy-row-desc">
                                    Let others ask this traveler to exchange
                                    seats
                                  </span>
                                </span>
                                <input
                                  className="fd-passenger-privacy-input"
                                  type="checkbox"
                                  checked={row.acceptPeerSwap !== false}
                                  onChange={(e) =>
                                    updatePassenger(
                                      index,
                                      "acceptPeerSwap",
                                      e.target.checked,
                                    )
                                  }
                                />
                              </label>
                            </li>
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="fd-book-passengers-section">
                  <h3 className="fd-book-passengers-heading">Seat selection</h3>
                  <p
                    className="fd-book-passenger-intro"
                    style={{ marginTop: 0 }}
                  >
                    Choose class and seat separately for each traveler in the
                    cards above.
                  </p>
                </div>

                <div className="fd-book-checkout" aria-label="Payment summary">
                  {selectedSeatDetails.length > 0 && (
                    <div
                      style={{
                        marginBottom: 10,
                        borderBottom: "1px dashed rgba(255,255,255,0.22)",
                        paddingBottom: 10,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.85,
                          marginBottom: 6,
                        }}
                      >
                        Seat price preview
                      </div>
                      {selectedSeatDetails.map((seat) => (
                        <div
                          key={seat.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ opacity: 0.9 }}>
                            Traveler {seat.travelerIndex + 1}: Seat{" "}
                            {seat.seat_number}
                            <span style={{ display: "block", opacity: 0.75 }}>
                              Flight price: {formatPrice(flight?.price || 0)}
                            </span>
                          </span>
                          <strong>
                            Seat price: {formatPrice(seat.price || 0)}
                          </strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="fd-book-total-row">
                    <span className="fd-book-total-label">Trip total</span>
                    <strong className="fd-book-total-value">
                      {formatPrice(totalDue)}
                    </strong>
                  </div>
                  <div className="fd-wallet-pay-row">
                    <span className="fd-wallet-pay-label">Wallet balance</span>
                    <span className="fd-wallet-pay-amt">
                      {formatPrice(walletBal)}
                    </span>
                    <button
                      type="button"
                      className="fd-wallet-topup"
                      onClick={() =>
                        navigate("/wallet", {
                          state: {
                            from: `${location.pathname}${location.search}`,
                          },
                        })
                      }
                    >
                      Add funds
                    </button>
                  </div>
                  {!canPay && (
                    <div className="fd-wallet-shortfall">
                      You need{" "}
                      <strong>{formatPrice(totalDue - walletBal)}</strong> more
                      in your wallet to book.{" "}
                      <button
                        type="button"
                        className="fd-wallet-link"
                        onClick={() =>
                          navigate("/wallet", {
                            state: {
                              from: `${location.pathname}${location.search}`,
                            },
                          })
                        }
                      >
                        Top up
                      </button>
                    </div>
                  )}
                  <button
                    type="submit"
                    className="fd-btn-primary fd-btn-book"
                    disabled={bookingLoading || !canPay}
                  >
                    {bookingLoading ? "Booking…" : "Pay from wallet & confirm"}
                  </button>
                </div>
              </form>
            </main>
          </div>
        )}

        <footer className="fd-footer">
          <span>Binayak Airlines</span>
          <span className="fd-footer-dot">·</span>
          <span>Nepal Domestic Flights</span>
        </footer>

        {seatModalTravelerIndex != null && (
          <div
            className="fd-modal-overlay"
            role="presentation"
            onClick={() => setSeatModalTravelerIndex(null)}
          >
            <div
              className="fd-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Seat selection"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="fd-modal-header">
                <div>
                  <h2>Select seat</h2>
                  <p className="fd-modal-flight">
                    Traveler{" "}
                    {existingBookedPassengerCount + seatModalTravelerIndex + 1}{" "}
                    · {flight.flight_number}
                  </p>
                </div>
                <button
                  type="button"
                  className="fd-modal-close"
                  onClick={() => setSeatModalTravelerIndex(null)}
                >
                  ✕
                </button>
              </div>
              <AircraftSeatMap
                seats={allSeats}
                selectedSeatIds={seatAssignments.filter(Boolean)}
                onToggleSeat={(seat) => {
                  if (seat.status !== "available") return;
                  const traveler = passengerRows[seatModalTravelerIndex];
                  const travelerClass = normalizeClass(
                    traveler?.seatClass || "Economy",
                  );
                  if (normalizeClass(seat.class) !== travelerClass) {
                    setBookingError(
                      `Traveler ${seatModalTravelerIndex + 1}: please choose a ${traveler?.seatClass || "Economy"} seat only.`,
                    );
                    return;
                  }
                  setBookingError("");
                  setSeatAssignments((prev) => {
                    const next = [...prev];
                    const takenByOther = next.some(
                      (id, idx) =>
                        idx !== seatModalTravelerIndex &&
                        Number(id) === Number(seat.id),
                    );
                    if (takenByOther) return prev;
                    next[seatModalTravelerIndex] =
                      Number(next[seatModalTravelerIndex]) === Number(seat.id)
                        ? null
                        : seat.id;
                    return next;
                  });
                }}
              />
              <div
                style={{
                  marginTop: 14,
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  type="button"
                  className="fd-btn-primary"
                  onClick={() => setSeatModalTravelerIndex(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BookFlightPage;
