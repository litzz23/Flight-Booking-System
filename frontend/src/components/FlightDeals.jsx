import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import FlightsHeader from "./flights/FlightsHeader";
import { flights as flightsAPI } from "../api";
import { getFlightDurationMinutes } from "../utils/flightTime";
import cloudsBg from "../assets/clouds-bg.png";
import "./FlightDeals.css";

const GETAWAY_THEME_TEMPLATES = [
  {
    emoji: "🏔️",
    title: "Mountain Escape",
    description: "Perfect for scenic mountain adventures.",
    destination: "Lukla",
  },
  {
    emoji: "🌿",
    title: "Nature Break",
    description: "Green escapes and relaxed short stays.",
    destination: "Bharatpur",
  },
  {
    emoji: "🪂",
    title: "Adventure Pick",
    description: "Great for active trips and weekend plans.",
    destination: "Pokhara",
  },
  {
    emoji: "🍵",
    title: "Culture & Chill",
    description: "City vibes, local food, and easy travel.",
    destination: "Bhadrapur",
  },
];

const FAQ_ITEMS = [
  {
    question: "Why one tile per city?",
    answer:
      "We show one best offer per destination on this page. Tap a tile to open the full flight search for that route with every flight, dates, and prices.",
  },
  {
    question: "What happens when I tap a destination?",
    answer:
      "You go to the flights search screen with filters, a date grid, price graph, and all flights on that route.",
  },
  {
    question: "How do I book?",
    answer:
      "Open a destination from deals, pick a flight on the next page, then sign in to book.",
  },
  {
    question: "Can I cancel?",
    answer: "Yes — open My Bookings and cancel a confirmed booking.",
  },
  {
    question: "Where do you fly?",
    answer:
      "Domestic Nepal routes including Kathmandu, Pokhara, Lukla, Bharatpur, and more.",
  },
];

function matchesSearch(deal, q) {
  if (!q) return true;
  const fields = [
    deal.destination,
    deal.tagline,
    deal.flight_number,
    deal.airline,
  ];
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function FlightDeals() {
  const navigate = useNavigate();

  const [allDeals, setAllDeals] = useState([]);
  const [meta, setMeta] = useState({ origins: [] });
  const [loading, setLoading] = useState(true);

  const [originCity, setOriginCity] = useState("Kathmandu");
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    flightsAPI
      .getMeta()
      .then(setMeta)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    flightsAPI
      .getDeals({ origin: originCity, include_all: "1" })
      .then(setAllDeals)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [originCity]);

  useEffect(() => {
    const close = () => {
      setShowOriginPicker(false);
    };
    if (showOriginPicker) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showOriginPicker]);

  useEffect(() => {
    if (meta.origins?.length && !meta.origins.includes(originCity)) {
      setOriginCity(meta.origins[0]);
    }
  }, [meta.origins, originCity]);

  const searchQ = searchQuery.trim().toLowerCase();

  const topDealsOnePerDestination = useMemo(() => {
    const filtered = allDeals.filter((deal) => {
      if (deal.available_seats < 1) return false;
      const durationMin = getFlightDurationMinutes(
        deal.departure_time,
        deal.arrival_time,
      );
      if (!Number.isFinite(durationMin)) return false;
      return matchesSearch(deal, searchQ);
    });
    const map = new Map();
    for (const f of filtered) {
      const key = f.destination.trim().toLowerCase();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, f);
        continue;
      }
      const better =
        Number(f.price) < Number(prev.price) ||
        (Number(f.price) === Number(prev.price) &&
          (f.discount || 0) > (prev.discount || 0));
      if (better) map.set(key, f);
    }
    return Array.from(map.values()).sort(
      (a, b) => Number(a.price) - Number(b.price),
    );
  }, [allDeals, searchQ]);

  const formatPrice = (num) => "NPR " + Number(num).toLocaleString();

  const flightCountByDestination = useMemo(() => {
    const m = {};
    const o = originCity.trim().toLowerCase();
    for (const f of allDeals) {
      if (f.origin.trim().toLowerCase() !== o) continue;
      if (f.available_seats < 1) continue;
      const d = f.destination.trim().toLowerCase();
      m[d] = (m[d] || 0) + 1;
    }
    return m;
  }, [allDeals, originCity]);

  const getawayThemes = GETAWAY_THEME_TEMPLATES;

  const goToSearch = (destination) => {
    navigate(
      `/flights/search?origin=${encodeURIComponent(originCity)}&destination=${encodeURIComponent(destination)}`,
    );
  };

  const originPickList = meta.origins?.length ? meta.origins : ["Kathmandu"];

  return (
    <div
      className="fd-page fd-page-deals-landing"
      style={{ backgroundImage: `url(${cloudsBg})` }}
    >
      <FlightsHeader activeTab="flights" />

      <div className="fd-hero fd-hero-deals">
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
        <p className="fd-hero-sub">Dream bigger. Pay less.</p>
        <div className="fd-hero-title-row">
          <h1 className="fd-hero-title">Flight Deals</h1>
        </div>

        <div className="fd-search-section fd-search-wrap">
          <div className="fd-search-bar">
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
              placeholder="Filter destinations…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="fd-search-clear"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="fd-origin-row" onClick={(e) => e.stopPropagation()}>
          <span className="fd-origin-label">From</span>
          <button
            type="button"
            className="fd-origin-btn"
            onClick={() => setShowOriginPicker(!showOriginPicker)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {originCity}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
          {showOriginPicker && (
            <div className="fd-dropdown fd-origin-dropdown">
              {originPickList.map((city) => (
                <div
                  key={city}
                  className={`fd-dropdown-item ${city === originCity ? "selected" : ""}`}
                  onClick={() => {
                    setOriginCity(city);
                    setShowOriginPicker(false);
                  }}
                >
                  {city}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="fd-content fd-content-deals-landing">
        {loading ? (
          <div className="fd-loading">
            <div className="fd-spinner" />
            Loading deals…
          </div>
        ) : topDealsOnePerDestination.length === 0 ? (
          <div className="fd-no-results">
            <p>No destinations match your search.</p>
            <button
              type="button"
              className="fd-btn-secondary"
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            <p className="fd-deals-count">
              {topDealsOnePerDestination.length} destination
              {topDealsOnePerDestination.length === 1 ? "" : "s"} from{" "}
              {originCity}
            </p>
            <div className="fd-deals-grid fd-deals-grid--landing">
              {topDealsOnePerDestination.map((deal) => (
                <button
                  key={deal.destination}
                  type="button"
                  className="fd-deal-card fd-deal-card--image-only"
                  onClick={() => goToSearch(deal.destination)}
                >
                  <div
                    className="fd-deal-image fd-deal-image--landing"
                    style={{
                      backgroundImage: deal.image_url
                        ? `url(${deal.image_url})`
                        : "linear-gradient(160deg, #3d4a6b 0%, #1a1a28 100%)",
                    }}
                  >
                    <div className="fd-deal-overlay fd-deal-overlay--landing">
                      <h3 className="fd-deal-city">{deal.destination}</h3>
                      <p className="fd-deal-from-price">
                        From {formatPrice(deal.price)}
                      </p>
                    </div>
                    {deal.discount > 0 && (
                      <span className="fd-deal-discount fd-deal-discount--corner">
                        <span className="fd-discount-pct">
                          {deal.discount}%
                        </span>{" "}
                        off
                      </span>
                    )}
                    {(flightCountByDestination[
                      deal.destination.trim().toLowerCase()
                    ] || 0) > 1 && (
                      <span className="fd-deal-multi-count">
                        {
                          flightCountByDestination[
                            deal.destination.trim().toLowerCase()
                          ]
                        }{" "}
                        flights on this route
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <section className="fd-section fd-getaway">
          <h2 className="fd-section-title">Plan your perfect getaway</h2>
          <p className="fd-section-sub">
            Opens the full flights page for that destination
          </p>
          <div className="fd-getaway-grid">
            {getawayThemes.map((theme) => (
              <button
                key={theme.title}
                type="button"
                className="fd-getaway-card"
                onClick={() => goToSearch(theme.destination)}
              >
                <span className="fd-getaway-emoji">{theme.emoji}</span>
                <div>
                  <h3>{theme.title}</h3>
                  <p>{theme.description}</p>
                </div>
                <svg
                  className="fd-getaway-arrow"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                </svg>
              </button>
            ))}
          </div>
        </section>

        <section className="fd-section fd-faq">
          <h2 className="fd-section-title">Frequently asked questions</h2>
          <div className="fd-faq-list">
            {FAQ_ITEMS.map((faq, i) => (
              <div
                key={i}
                className={`fd-faq-item ${openFaq === i ? "open" : ""}`}
              >
                <button
                  type="button"
                  className="fd-faq-question"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  {faq.question}
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="fd-faq-chevron"
                  >
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="fd-faq-answer">{faq.answer}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        <footer className="fd-footer">
          <span>Binayak Airlines</span>
          <span className="fd-footer-dot">·</span>
          <span>Nepal Domestic Flights</span>
        </footer>
      </div>
    </div>
  );
}

export default FlightDeals;
