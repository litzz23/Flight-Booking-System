import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { flights as flightsAPI, bookings as bookingsAPI, seats as seatsAPI } from "../api";
import { CABIN_CLASSES } from "../flightConstants";
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
    seat_class: passed.classFilter || "Economy",
  });
  /** One row per traveler: name, email, phone */
  const [passengerRows, setPassengerRows] = useState([
    { name: "", email: "", phone: "", gender: "male" },
  ]);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingError, setBookingError] = useState("");
  const [allSeats, setAllSeats] = useState([]);
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [seatModalOpen, setSeatModalOpen] = useState(false);

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
      seat_class: classFilter,
    }));
  }, [passengerFilter, classFilter]);

  useEffect(() => {
    const n = Math.max(1, Number(bookingForm.passengers) || 1);
    setPassengerRows((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) {
        next.push({ name: "", email: "", phone: "", gender: "male" });
      }
      return next;
    });
  }, [bookingForm.passengers]);

  useEffect(() => {
    if (!flight || !user) return;
    setPassengerRows((prev) => {
      if (prev.length === 0) {
        return [{ name: user.name || "", email: user.email || "", phone: user.phone || "", gender: "male" }];
      }
      const p0 = prev[0];
      if (p0.name || p0.email) return prev;
      const copy = [...prev];
      copy[0] = {
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
      };
      return copy;
    });
  }, [flight, user]);

  useEffect(() => {
    if (!flight?.id) return;
    flightsAPI.getSeats(flight.id).then(setAllSeats).catch(() => setAllSeats([]));
  }, [flight?.id]);

  useEffect(() => {
    const needed = Number(bookingForm.passengers) || 1;
    setSelectedSeatIds((prev) => prev.slice(0, needed));
  }, [bookingForm.passengers]);

  const updatePassenger = (index, field, value) => {
    setPassengerRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
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
  const getDurationMin = (dep, arr) =>
    Math.round((new Date(arr) - new Date(dep)) / 60000);
  const formatDuration = (dep, arr) => {
    const mins = getDurationMin(dep, arr);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  };

  const tripSummary = flight
    ? `${flight.origin} → ${flight.destination} · ${new Date(flight.departure_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`
    : "";

  const totalDue =
    flight != null
      ? Number(flight.price) * Number(bookingForm.passengers)
      : 0;
  const walletBal = Number(user?.wallet_balance ?? 0);
  const canPay =
    Math.round(walletBal * 100) >= Math.round(totalDue * 100);

  const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());

  const handleBook = async (e) => {
    e.preventDefault();
    if (!flight) return;
    const n = Math.max(1, Number(bookingForm.passengers) || 1);
    const passenger_details = passengerRows.slice(0, n).map((p) => ({
      name: p.name.trim(),
      email: p.email.trim(),
      phone: (p.phone || "").trim() || null,
    }));

    for (let i = 0; i < n; i++) {
      const p = passenger_details[i];
      if (!p || !p.name || !p.email) {
        setBookingError(`Enter full name and email for passenger ${i + 1}.`);
        return;
      }
      if (!emailOk(p.email)) {
        setBookingError(`Passenger ${i + 1}: enter a valid email address.`);
        return;
      }
    }

    setBookingLoading(true);
    setBookingError("");
    try {
      if (selectedSeatIds.length !== n) {
        setBookingError(`Please select exactly ${n} seat(s).`);
        return;
      }
      await seatsAPI.lock(selectedSeatIds);
      const primary = passenger_details[0];
      const result = await bookingsAPI.create({
        flight_id: flight.id,
        passengers: bookingForm.passengers,
        seat_class: bookingForm.seat_class,
        passenger_name: primary.name,
        passenger_email: primary.email,
        passenger_phone: primary.phone,
        passenger_details,
      });
      await bookingsAPI.confirmSeats(result.id, {
        seatIds: selectedSeatIds,
        passengerNames: passenger_details.map((p) => p.name),
        passengerGenders: passengerRows.slice(0, n).map((row) => row.gender || "male"),
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
            ← Flight deals
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
                    <span className="fd-route-city">{flight.destination}</span>
                    <span className="fd-route-time">
                      {new Date(flight.arrival_time).toLocaleString()}
                    </span>
                  </div>
                </div>
                <p className="fd-book-flight-meta">
                  {flight.flight_number} · {flight.airline} ·{" "}
                  {formatDuration(flight.departure_time, flight.arrival_time)} ·
                  Nonstop · {flight.available_seats} seats left
                </p>
                <div className="fd-book-price-row">
                  <span className="fd-price-current">
                    {formatPrice(flight.price)}
                  </span>
                  <span className="fd-price-label">per person</span>
                </div>
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
                  <div className="fd-book-error fd-modal-error">{bookingError}</div>
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
                          { length: Math.min(9, flight.available_seats) },
                          (_, i) => i + 1,
                        ).map((num) => (
                          <option key={num} value={num}>
                            {num}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="fd-form-field">
                      <label>Class</label>
                      <select
                        value={bookingForm.seat_class}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            seat_class: e.target.value,
                          })
                        }
                      >
                        {CABIN_CLASSES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="fd-book-passengers-section">
                  <h3 className="fd-book-passengers-heading">
                    Traveler information
                    {bookingForm.passengers > 1 && (
                      <span className="fd-book-passengers-count">
                        {bookingForm.passengers} people
                      </span>
                    )}
                  </h3>
                  <div className="fd-book-passenger-stack">
                    {passengerRows.map((row, index) => (
                      <div className="fd-passenger-card" key={index}>
                        <div className="fd-passenger-card-head">
                          <span className="fd-passenger-num" aria-hidden="true">
                            {index + 1}
                          </span>
                          <div className="fd-passenger-card-titles">
                            <h4 className="fd-passenger-card-title">
                              Traveler {index + 1}
                            </h4>
                            {index === 0 ? (
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
                              As on passport or national ID
                            </span>
                            <input
                              id={`pax-name-${index}`}
                              type="text"
                              value={row.name}
                              onChange={(e) =>
                                updatePassenger(index, "name", e.target.value)
                              }
                              placeholder="e.g. Samira Thapa"
                              required
                              autoComplete={`section-pax-${index} name`}
                            />
                          </div>
                          <div className="fd-form-field">
                            <label htmlFor={`pax-email-${index}`}>
                              Email
                            </label>
                            <span className="fd-field-hint">
                              For itinerary & reminders
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

                        <div className="fd-form-field fd-passenger-phone-field">
                          <label htmlFor={`pax-phone-${index}`}>
                            Mobile number
                          </label>
                          <span className="fd-field-hint fd-field-hint-optional">
                            Optional — for day-of travel alerts
                          </span>
                          <input
                            id={`pax-phone-${index}`}
                            type="tel"
                            value={row.phone}
                            onChange={(e) =>
                              updatePassenger(index, "phone", e.target.value)
                            }
                            placeholder="+977 98XXXXXXXX"
                            autoComplete={`section-pax-${index} tel`}
                          />
                        </div>

                        <div className="fd-form-field fd-passenger-gender-field">
                          <label htmlFor={`pax-gender-${index}`}>
                            Passenger gender
                          </label>
                          <span className="fd-field-hint">
                            Shown on the seat map after confirmation
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
                    ))}
                  </div>
                </div>

                <div className="fd-book-passengers-section">
                  <h3 className="fd-book-passengers-heading">Seat selection</h3>
                  <button
                    type="button"
                    className="fd-btn-secondary"
                    onClick={() => setSeatModalOpen(true)}
                  >
                    {selectedSeatIds.length > 0
                      ? `Selected ${selectedSeatIds.length}/${bookingForm.passengers} seats`
                      : `Choose ${bookingForm.passengers} seat(s)`}
                  </button>
                </div>

                <div className="fd-book-checkout" aria-label="Payment summary">
                  <div className="fd-book-total-row">
                    <span className="fd-book-total-label">Trip total</span>
                    <strong className="fd-book-total-value">
                      {formatPrice(flight.price * bookingForm.passengers)}
                    </strong>
                  </div>
                  <div className="fd-wallet-pay-row">
                    <span className="fd-wallet-pay-label">Wallet balance</span>
                    <span className="fd-wallet-pay-amt">{formatPrice(walletBal)}</span>
                    <button
                      type="button"
                      className="fd-wallet-topup"
                      onClick={() =>
                        navigate("/wallet", {
                          state: { from: `${location.pathname}${location.search}` },
                        })
                      }
                    >
                      Add funds
                    </button>
                  </div>
                  {!canPay && (
                    <div className="fd-wallet-shortfall">
                      You need{" "}
                      <strong>
                        {formatPrice(totalDue - walletBal)}
                      </strong>{" "}
                      more in your wallet to book.{" "}
                      <button
                        type="button"
                        className="fd-wallet-link"
                        onClick={() =>
                          navigate("/wallet", {
                            state: { from: `${location.pathname}${location.search}` },
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
          <span>Binayak's Flights</span>
          <span className="fd-footer-dot">·</span>
          <span>Nepal Domestic Flights</span>
        </footer>

        {seatModalOpen && (
          <div
            className="fd-modal-overlay"
            role="presentation"
            onClick={() => setSeatModalOpen(false)}
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
                  <h2>Select seats</h2>
                  <p className="fd-modal-flight">
                    Choose {bookingForm.passengers} seat(s) for {flight.flight_number}
                  </p>
                </div>
                <button
                  type="button"
                  className="fd-modal-close"
                  onClick={() => setSeatModalOpen(false)}
                >
                  ✕
                </button>
              </div>
              <AircraftSeatMap
                seats={allSeats}
                selectedSeatIds={selectedSeatIds}
                onToggleSeat={(seat) => {
                  setSelectedSeatIds((prev) => {
                    if (prev.includes(seat.id)) return prev.filter((id) => id !== seat.id);
                    if (prev.length >= Number(bookingForm.passengers)) return prev;
                    return [...prev, seat.id];
                  });
                }}
              />
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button type="button" className="fd-btn-primary" onClick={() => setSeatModalOpen(false)}>
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
