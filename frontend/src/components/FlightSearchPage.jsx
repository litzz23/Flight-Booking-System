import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { flights as flightsAPI, predictions as predictionsAPI } from "../api";
import { SORT_OPTIONS } from "../flightConstants";
import FlightsHeader from "./flights/FlightsHeader";
import FlightsFilterBar from "./flights/FlightsFilterBar";
import {
  buildLocalDateKeys,
  minPriceByDate,
  RouteDateGrid,
  findCheapestDateKey,
} from "./flights/RoutePriceTools";
import {
  pickTopDeparting,
  buildPriceInsights,
} from "./flights/FlightSearchRanking";
import cloudsBg from "../assets/clouds-bg.png";
import {
  getFlightDurationMinutes,
  formatFlightDuration,
} from "../utils/flightTime";
import "./FlightDeals.css";

function savingsAmount(d) {
  const orig = Number(d.original_price ?? d.price);
  const p = Number(d.price);
  return Math.max(0, orig - p);
}

function sortFlights(arr, sortBy, getDurationMin) {
  const copy = [...arr];
  copy.sort((a, b) => {
    if (sortBy === "Cheapest") return Number(a.price) - Number(b.price);
    if (sortBy === "Price: High to Low")
      return Number(b.price) - Number(a.price);
    if (sortBy === "Earliest departure")
      return new Date(a.departure_time) - new Date(b.departure_time);
    if (sortBy === "Shortest flight") {
      const da = getDurationMin(a.departure_time, a.arrival_time);
      const db = getDurationMin(b.departure_time, b.arrival_time);
      return da - db;
    }
    const bd = (b.discount || 0) - (a.discount || 0);
    if (bd !== 0) return bd;
    const sv = savingsAmount(b) - savingsAmount(a);
    if (sv !== 0) return sv;
    return Number(a.price) - Number(b.price);
  });
  return copy;
}

export default function FlightSearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const origin = searchParams.get("origin") || "Kathmandu";
  const destination = searchParams.get("destination");

  const [routeFlights, setRouteFlights] = useState([]);
  const [meta, setMeta] = useState({
    origins: [],
    destinations: [],
    airlines: [],
  });
  const [loading, setLoading] = useState(true);
  const [riskByFlightId, setRiskByFlightId] = useState({});

  const [tripType, setTripType] = useState("One way");
  const [passengerFilter, setPassengerFilter] = useState(1);
  const [classFilter, setClassFilter] = useState("Economy");
  const [stopsFilter, setStopsFilter] = useState("Any");
  const [airlineFilter, setAirlineFilter] = useState("All");
  const [sortBy, setSortBy] = useState("Best value");
  const [maxPrice, setMaxPrice] = useState(100000);
  const [maxDuration, setMaxDuration] = useState(480);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null);
  const [monthRiskData, setMonthRiskData] = useState(null);

  useEffect(() => {
    predictionsAPI
      .getMonthRisk()
      .then(setMonthRiskData)
      .catch(() => setMonthRiskData(null));
  }, []);

  useEffect(() => {
    flightsAPI
      .getMeta()
      .then(setMeta)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!destination) return;
    setLoading(true);
    flightsAPI
      .getAll({
        origin,
        destination,
        status: "scheduled",
      })
      .then(setRouteFlights)
      .catch(() => setRouteFlights([]))
      .finally(() => setLoading(false));
  }, [origin, destination]);

  useEffect(() => {
    const close = () => setActiveDropdown(null);
    if (activeDropdown) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [activeDropdown]);

  const getDurationMin = useCallback(
    (dep, arr) => getFlightDurationMinutes(dep, arr),
    [],
  );

  const filtered = useMemo(() => {
    return routeFlights.filter((deal) => {
      if (deal.available_seats < passengerFilter) return false;
      if (Number(deal.price) > maxPrice) return false;
      if (airlineFilter !== "All" && deal.airline !== airlineFilter)
        return false;
      const dur = getDurationMin(deal.departure_time, deal.arrival_time);
      if (dur > maxDuration) return false;
      return true;
    });
  }, [
    routeFlights,
    passengerFilter,
    maxPrice,
    airlineFilter,
    maxDuration,
    getDurationMin,
  ]);

  const listFlights = useMemo(() => {
    let list = filtered;
    if (selectedCalendarDate) {
      list = list.filter(
        (d) => d.departure_time.slice(0, 10) === selectedCalendarDate,
      );
    }
    return sortFlights(list, sortBy, getDurationMin);
  }, [filtered, selectedCalendarDate, sortBy, getDurationMin]);

  useEffect(() => {
    const ids = listFlights.map((f) => f.id);
    if (ids.length === 0) {
      setRiskByFlightId({});
      return;
    }
    let cancelled = false;
    Promise.all(
      ids.map((id) =>
        predictionsAPI
          .getCancellationRisk(id)
          .then((data) => [id, data])
          .catch(() => [id, null]),
      ),
    ).then((pairs) => {
      if (cancelled) return;
      const next = {};
      for (const [id, data] of pairs) {
        if (data) next[id] = data;
      }
      setRiskByFlightId(next);
    });
    return () => {
      cancelled = true;
    };
  }, [listFlights]);

  const dateKeys = useMemo(() => buildLocalDateKeys(21), []);
  const priceByDate = useMemo(() => {
    return minPriceByDate(filtered, origin, destination);
  }, [filtered, origin, destination]);

  const cheapestDateKey = useMemo(
    () => findCheapestDateKey(priceByDate, dateKeys),
    [priceByDate, dateKeys],
  );

  const priceInsights = useMemo(
    () => buildPriceInsights(priceByDate, dateKeys),
    [priceByDate, dateKeys],
  );

  const topDepartingPicks = useMemo(
    () => pickTopDeparting(filtered, getDurationMin, 4),
    [filtered, getDurationMin],
  );

  const formatPrice = (num) => "NPR " + Number(num).toLocaleString();
  const formatShortPrice = (n) => {
    const x = Number(n);
    if (x >= 1000) return `${Math.round(x / 1000)}k`;
    return String(x);
  };
  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  const resetFilters = () => {
    setPassengerFilter(1);
    setClassFilter("Economy");
    setStopsFilter("Any");
    setAirlineFilter("All");
    setSortBy("Best value");
    setMaxPrice(100000);
    setMaxDuration(480);
    setSelectedCalendarDate(null);
  };

  const hasActiveFilters =
    passengerFilter > 1 ||
    classFilter !== "Economy" ||
    airlineFilter !== "All" ||
    maxPrice < 100000 ||
    maxDuration < 480 ||
    sortBy !== "Best value" ||
    stopsFilter !== "Any" ||
    selectedCalendarDate;

  const handleBook = (flight) => {
    if (!user) {
      navigate("/auth", {
        state: {
          from: `/flights/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`,
        },
      });
      return;
    }
    navigate(`/flights/book/${flight.id}`, {
      state: {
        passengerFilter,
        classFilter,
        tripType,
        stopsFilter,
        airlineFilter,
        originCity: origin,
      },
    });
  };

  if (!destination) {
    return <Navigate to="/flights" replace />;
  }

  return (
    <div
      className="fd-page fd-flight-search-page"
      style={{ backgroundImage: `url(${cloudsBg})` }}
    >
      <FlightsHeader activeTab="flights" />

      <div className="fd-search-page-toolbar">
        <button
          type="button"
          className="fd-search-page-back"
          onClick={() => navigate("/flights")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
          Flight Deals
        </button>
      </div>

      <div className="fd-search-page-hero">
        <p className="fd-search-page-route">
          {origin} → {destination}
        </p>
        <h1 className="fd-search-page-title">Flights</h1>
        <p className="fd-search-page-sub">
          Compare times, prices, and dates — filters, a price graph, and a
          flexible date grid.
        </p>
      </div>

      <div className="fd-content fd-search-page-inner">
        <FlightsFilterBar
          onAllFilters={resetFilters}
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

        {!loading && topDepartingPicks.length > 0 && (
          <section
            className="gf-top-departing"
            aria-label="Top departing flights"
          >
            <div className="gf-top-departing-head">
              <h2 className="gf-top-departing-title">Top departing flights</h2>
              <p className="gf-top-departing-sub">
                Ranked by price, duration, and time of day
              </p>
            </div>
            <div className="gf-top-departing-row">
              {topDepartingPicks.map((deal, idx) => (
                <button
                  key={deal.id}
                  type="button"
                  className="gf-top-card"
                  onClick={() => handleBook(deal)}
                >
                  <span className="gf-top-rank">{idx + 1}</span>
                  <div className="gf-top-main">
                    <span className="gf-top-time">
                      {new Date(deal.departure_time).toLocaleTimeString(
                        "en-GB",
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </span>
                    <span className="gf-top-meta">
                      {deal.airline} ·{" "}
                      {formatFlightDuration(
                        deal.departure_time,
                        deal.arrival_time,
                      )}
                    </span>
                  </div>
                  <span className="gf-top-price">
                    {formatPrice(deal.price)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section
          className="gf-search-panel"
          aria-label="Price insights and dates"
        >
          {priceInsights.length > 0 && (
            <div className="gf-insights">
              <div className="gf-insights-head">
                <span className="gf-insights-badge">Smart picks</span>
                <span className="gf-insights-sub">
                  From prices across your date window
                </span>
              </div>
              <ul className="gf-insights-list">
                {priceInsights.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <RouteDateGrid
            dateKeys={dateKeys}
            priceByDate={priceByDate}
            selectedDate={selectedCalendarDate}
            onSelectDate={setSelectedCalendarDate}
            formatShortPrice={formatShortPrice}
            cheapestDateKey={cheapestDateKey}
          />

          {selectedCalendarDate && (
            <button
              type="button"
              className="fd-clear-date gf-clear-date"
              onClick={() => setSelectedCalendarDate(null)}
            >
              Clear date filter
            </button>
          )}

          {monthRiskData?.months?.length > 0 && (
            <div className="fd-month-risk-panel" aria-label="Seasonal disruption by month">
              <div className="gf-insights-head fd-month-risk-head">
                <span className="gf-insights-badge">Disruption by month</span>
                <span className="gf-insights-sub">
                  {monthRiskData.timezone_note}
                </span>
              </div>
              <div className="fd-month-risk-scroll">
                {monthRiskData.months.map((m) => (
                  <div
                    key={m.month}
                    className={`fd-month-risk-cell fd-month-risk-cell--${
                      m.points === 0 ? "none" : m.points >= 20 ? "high" : "med"
                    }`}
                    title={`${m.name}: ${m.description}`}
                  >
                    <span className="fd-month-risk-abbr">{m.short_name}</span>
                    <span className="fd-month-risk-pts">
                      {m.points > 0 ? `+${m.points}` : "0"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="fd-month-risk-legend">
                Points shown are added to the disruption score for that departure month
                (Jun–Aug monsoon +20, Dec–Jan winter +15). Region, demand, and time-of-day
                add more on each flight.
              </p>
            </div>
          )}
        </section>

        <div className="fd-deals-header fd-search-sort-row">
          <div className="fd-search-count-block">
            <span className="fd-search-count">
              {loading
                ? "…"
                : `${listFlights.length} flight${listFlights.length === 1 ? "" : "s"}`}
            </span>
            {!loading && routeFlights.length > 0 && (
              <span className="fd-search-multi-hint">
                Every scheduled option on {origin} → {destination} is shown
                below.
              </span>
            )}
          </div>
          <div className="fd-sort-wrapper" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="fd-sort-btn"
              onClick={() =>
                setActiveDropdown(activeDropdown === "sort" ? null : "sort")
              }
            >
              Sort: {sortBy}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {activeDropdown === "sort" && (
              <div className="fd-dropdown fd-sort-dropdown">
                {SORT_OPTIONS.map((s) => (
                  <div
                    key={s}
                    className={`fd-dropdown-item ${s === sortBy ? "selected" : ""}`}
                    onClick={() => {
                      setSortBy(s);
                      setActiveDropdown(null);
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="fd-loading">
            <div className="fd-spinner" />
            Loading flights…
          </div>
        ) : listFlights.length === 0 ? (
          <div className="fd-no-results">
            <p>No flights match your filters.</p>
            <button
              type="button"
              className="fd-btn-secondary"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="fd-flight-list">
            {listFlights.map((deal) => (
              <li key={deal.id}>
                <button
                  type="button"
                  className="fd-flight-row"
                  onClick={() => handleBook(deal)}
                >
                  <div className="fd-flight-row-main">
                    <span className="fd-flight-airline">
                      {deal.airline} · {deal.flight_number}
                    </span>
                    <span className="fd-flight-route-row">
                      <span className="fd-flight-route">
                        {deal.origin} → {deal.destination}
                      </span>
                      {riskByFlightId[deal.id] && (
                        <span
                          className={`fd-flight-risk-badge fd-flight-risk-badge--${riskByFlightId[deal.id].color}`}
                        >
                          {riskByFlightId[deal.id].label}
                        </span>
                      )}
                    </span>
                    <span className="fd-flight-when">
                      {formatDate(deal.departure_time)} ·{" "}
                      {formatFlightDuration(
                        deal.departure_time,
                        deal.arrival_time,
                      )}
                    </span>
                  </div>
                  <div className="fd-flight-row-price">
                    <span className="fd-deal-price">
                      {formatPrice(deal.price)}
                    </span>
                    {savingsAmount(deal) > 0 && (
                      <span className="fd-save-pill">
                        Save {formatPrice(savingsAmount(deal))}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
