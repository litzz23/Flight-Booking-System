import { useEffect, useState } from "react";
import { adminAlertsApi } from "../../services/adminApi";
import "./AdminAlertsPage.css";

const ALERT_TYPES = [
  {
    value: "delay",
    label: "⏱ Flight Delay",
    color: "#f39c12",
    description: "Notify passengers of a delayed departure",
  },
  {
    value: "cancelled",
    label: "✕ Flight Cancelled",
    color: "#e74c3c",
    description: "Notify passengers of a cancellation",
  },
  {
    value: "weather",
    label: "⛈ Weather Warning",
    color: "#e67e22",
    description: "Severe weather affecting this flight",
  },
  {
    value: "disaster",
    label: "⚠ Emergency Alert",
    color: "#c0392b",
    description: "Critical emergency notification",
  },
  {
    value: "info",
    label: "ℹ General Notice",
    color: "#2980b9",
    description: "General information for passengers",
  },
];

function formatDep(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return (
    d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
}

export default function AdminAlertsPage() {
  const [flights, setFlights] = useState([]);
  const [flightSearch, setFlightSearch] = useState("");
  const [loadingFlights, setLoadingFlights] = useState(true);
  const [form, setForm] = useState({
    type: "delay",
    flight_id: "",
    delay_minutes: "",
    title: "",
    message: "",
    target: "flight",
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    adminAlertsApi
      .getFlights()
      .then((data) => setFlights(data.flights || []))
      .catch(() => {})
      .finally(() => setLoadingFlights(false));
  }, []);

  const selectedFlight = flights.find(
    (flight) => String(flight.id) === String(form.flight_id),
  );
  const selectedType = ALERT_TYPES.find((type) => type.value === form.type);
  const normalizedFlightSearch = flightSearch.trim().toLowerCase();
  const filteredFlights = normalizedFlightSearch
    ? flights.filter((flight) => {
        const searchable = [
          flight.flight_number,
          flight.airline,
          flight.origin,
          flight.destination,
          formatDep(flight.departure_time),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(normalizedFlightSearch);
      })
    : flights;

  const autoFillTitle = (type, flight) => {
    if (!flight) return "";
    const route = `${flight.origin} → ${flight.destination}`;
    if (type === "delay")
      return `Flight ${flight.flight_number} delayed — ${route}`;
    if (type === "cancelled")
      return `Flight ${flight.flight_number} cancelled — ${route}`;
    if (type === "weather") return `Weather advisory — ${route}`;
    if (type === "disaster") return `Emergency alert — ${flight.flight_number}`;
    return `Notice — Flight ${flight.flight_number}`;
  };

  const autoFillMessage = (type, flight, delayMins) => {
    if (!flight) return "";
    const route = `${flight.origin} → ${flight.destination}`;
    const dep = formatDep(flight.departure_time);
    if (type === "delay" && delayMins) {
      return `Your flight ${flight.flight_number} (${route}) originally scheduled at ${dep} has been delayed by ${delayMins} minutes. Please check the updated departure time at the airport.`;
    }
    if (type === "delay") {
      return `Your flight ${flight.flight_number} (${route}) has been delayed. Please check the airport display for updated departure times.`;
    }
    if (type === "cancelled") {
      return `We regret to inform you that flight ${flight.flight_number} (${route}) has been cancelled. Our team will contact you regarding rebooking or refund options.`;
    }
    if (type === "weather") {
      return `Due to adverse weather conditions, flight ${flight.flight_number} (${route}) may experience delays or disruptions. Please monitor airport announcements.`;
    }
    if (type === "disaster") {
      return `An emergency situation is affecting flight ${flight.flight_number} (${route}). Please follow instructions from airport staff and airline personnel.`;
    }
    return "";
  };

  const handleTypeChange = (type) => {
    setForm((current) => ({
      ...current,
      type,
      title: autoFillTitle(type, selectedFlight),
      message: autoFillMessage(type, selectedFlight, current.delay_minutes),
    }));
  };

  const handleFlightChange = (flightId) => {
    const flight = flights.find((item) => String(item.id) === String(flightId));
    setForm((current) => ({
      ...current,
      flight_id: flightId,
      title: autoFillTitle(current.type, flight),
      message: autoFillMessage(current.type, flight, current.delay_minutes),
    }));
  };

  const handleDelayChange = (value) => {
    setForm((current) => ({
      ...current,
      delay_minutes: value,
      message: autoFillMessage(current.type, selectedFlight, value),
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setResult(null);
    if (!form.title.trim() || !form.message.trim()) {
      setError("Title and message are required.");
      return;
    }
    if (form.target === "flight" && !form.flight_id) {
      setError("Please select a flight.");
      return;
    }
    setSending(true);
    try {
      const body = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        ...(form.target === "flight" && form.flight_id
          ? { flight_id: Number(form.flight_id) }
          : {}),
        ...(form.delay_minutes
          ? { delay_minutes: Number(form.delay_minutes) }
          : {}),
      };
      const data = await adminAlertsApi.broadcast(body);
      setResult(data);
      setForm((current) => ({
        ...current,
        title: "",
        message: "",
        flight_id: "",
        delay_minutes: "",
      }));
    } catch (err) {
      setError(
        err.response?.data?.error || err.message || "Failed to send alert.",
      );
    } finally {
      setSending(false);
    }
  };

  const selectedTypeColor = selectedType?.color || "#8ab4f8";

  return (
    <>
      <header className="ad-title-row">
        <h1>Flight Alerts</h1>
        <p>
          Send delay, cancellation, weather or emergency alerts to passengers of
          a specific flight.
        </p>
      </header>

      <section className="ad-panel ad-alerts-panel">
        <div className="ad-alerts-section">
          <label className="ad-alerts-label">Alert Type</label>
          <div className="ad-alerts-type-grid">
            {ALERT_TYPES.map((type) => (
              <button
                key={type.value}
                type="button"
                className={`ad-alerts-type-btn ${form.type === type.value ? "is-active" : ""}`}
                style={{
                  borderColor:
                    form.type === type.value
                      ? type.color
                      : "rgba(255,255,255,0.08)",
                  color: form.type === type.value ? type.color : "#9aa1b5",
                  background:
                    form.type === type.value
                      ? `${type.color}1A`
                      : "rgba(255,255,255,0.02)",
                }}
                onClick={() => handleTypeChange(type.value)}
              >
                <span className="ad-alerts-type-label">{type.label}</span>
                <span className="ad-alerts-type-desc">{type.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ad-alerts-section">
          <label className="ad-alerts-label">Search Flights</label>
          {loadingFlights ? (
            <p className="ad-empty">Loading flights...</p>
          ) : flights.length === 0 ? (
            <p className="ad-empty">No scheduled flights found.</p>
          ) : (
            <>
              <input
                type="text"
                value={flightSearch}
                onChange={(e) => setFlightSearch(e.target.value)}
                placeholder="Search by flight no, route, airline, or date"
                className="ad-alerts-search-input"
              />

              {filteredFlights.length === 0 ? (
                <p className="ad-empty">No flights match your search.</p>
              ) : (
                <div className="ad-alerts-flight-dropdown-wrap">
                  <select
                    className="ad-alerts-flight-dropdown"
                    value={form.flight_id}
                    onChange={(e) => handleFlightChange(e.target.value)}
                  >
                    <option value="">Choose a flight</option>
                    {filteredFlights.map((flight) => (
                      <option key={flight.id} value={String(flight.id)}>
                        {flight.flight_number} | {flight.origin} →{" "}
                        {flight.destination} | {flight.airline} |{" "}
                        {formatDep(flight.departure_time)}
                      </option>
                    ))}
                  </select>
                  {selectedFlight && (
                    <p className="ad-alerts-selected-meta">
                      {selectedFlight.booked_passengers} passenger
                      {Number(selectedFlight.booked_passengers) !== 1
                        ? "s"
                        : ""}{" "}
                      booked
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {form.type === "delay" && (
          <div className="ad-alerts-section ad-field">
            <label>Delay Duration (optional)</label>
            <div className="ad-alerts-delay-row">
              <input
                type="number"
                min="1"
                max="1440"
                placeholder="e.g. 90"
                value={form.delay_minutes}
                onChange={(e) => handleDelayChange(e.target.value)}
                className="ad-alerts-delay-input"
              />
              <span className="ad-alerts-delay-hint">
                Minutes to shift departure and arrival times.
              </span>
            </div>
          </div>
        )}

        <div className="ad-alerts-section ad-form-grid ad-alerts-form-grid">
          <div className="ad-field ad-field-span-2">
            <label>Alert Title</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((current) => ({ ...current, title: e.target.value }))
              }
              maxLength={150}
              placeholder="Auto-filled when you select a flight and type"
            />
          </div>
          <div className="ad-field ad-field-span-2">
            <label>Message</label>
            <textarea
              className="ad-alerts-textarea"
              value={form.message}
              onChange={(e) =>
                setForm((current) => ({ ...current, message: e.target.value }))
              }
              rows={4}
              placeholder="Auto-filled — edit as needed"
            />
          </div>
        </div>

        {form.title && selectedType && (
          <div
            className="ad-alerts-preview"
            style={{
              background: `${selectedTypeColor}10`,
              borderColor: `${selectedTypeColor}30`,
            }}
          >
            <p
              className="ad-alerts-preview-label"
              style={{ color: selectedTypeColor }}
            >
              Notification preview
            </p>
            <p className="ad-alerts-preview-title">{form.title}</p>
            {form.message && (
              <p className="ad-alerts-preview-msg">{form.message}</p>
            )}
          </div>
        )}

        {error && <p className="ad-error">{error}</p>}
        {result && <p className="ad-alerts-success">✓ {result.message}</p>}

        <div className="ad-alerts-actions">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sending}
            className="ad-btn primary ad-alerts-send-btn"
            style={{
              background: sending ? "#2a2a3a" : selectedTypeColor,
              borderColor: sending
                ? "rgba(255,255,255,0.14)"
                : `${selectedTypeColor}66`,
              color: sending ? "#666" : "#fff",
              cursor: sending ? "not-allowed" : "pointer",
            }}
          >
            {sending ? "Sending..." : `Send ${selectedType?.label || "Alert"}`}
          </button>
        </div>
      </section>
    </>
  );
}
