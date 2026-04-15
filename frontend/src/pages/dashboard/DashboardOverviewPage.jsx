import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../AuthContext";
import StatCard from "../../components/dashboard/StatCard";
import BookingTrendChart from "../../components/dashboard/BookingTrendChart";
import SpendingChart from "../../components/dashboard/SpendingChart";
import BookingStatusPieChart from "../../components/dashboard/BookingStatusPieChart";
import {
  getDashboardStats,
  getDashboardAnalytics,
  getRecommendations,
} from "../../services/userDashboardApi";

function money(v) {
  return "NPR " + Number(v || 0).toLocaleString();
}

function formatRecDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export default function DashboardOverviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [recs, setRecs] = useState(null);
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const statsLoadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const [y, m] = monthKey.split("-").map(Number);

    const load = async () => {
      setError("");
      if (!statsLoadedRef.current) setLoading(true);
      else setAnalyticsRefreshing(true);
      try {
        if (!statsLoadedRef.current) {
          const [statsData, analyticsData] = await Promise.all([
            getDashboardStats(),
            getDashboardAnalytics({ year: y, month: m }),
          ]);
          if (cancelled) return;
          setStats(statsData);
          setAnalytics(analyticsData);
          statsLoadedRef.current = true;
        } else {
          const analyticsData = await getDashboardAnalytics({
            year: y,
            month: m,
          });
          if (cancelled) return;
          setAnalytics(analyticsData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.error ||
              err.message ||
              "Failed to load dashboard.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAnalyticsRefreshing(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [monthKey]);

  useEffect(() => {
    getRecommendations()
      .then(setRecs)
      .catch(() => setRecs(null));
  }, []);

  const pieData = [
    { name: "Confirmed", value: stats?.confirmedBookings ?? 0 },
    { name: "Cancelled", value: stats?.cancelledBookings ?? 0 },
  ];

  const bookingsTrendData =
    analytics?.bookingsPerDayInMonth || analytics?.bookings_per_day_in_month || [];
  const bookingsMonthMeta =
    analytics?.bookingsDayMonthMeta || analytics?.bookings_day_month_meta;
  const spendingTrendData =
    analytics?.spendingPerDayInMonth || analytics?.spending_per_day_in_month || [];
  const spendingMonthMeta =
    analytics?.spendingDayMonthMeta || analytics?.spending_day_month_meta;
  const maxMonthKey = currentMonthKey();

  return (
    <>
      <header className="ud-title-row">
        <h1>User Dashboard</h1>
        <p>Welcome back, {user?.name}</p>
      </header>

      {error ? <p className="ud-error">{error}</p> : null}
      {loading ? <p className="ud-empty">Loading dashboard...</p> : null}

      {!loading && !error && (
        <>
          <section className="ud-stats-grid">
            <StatCard
              icon="✈"
              title="Total Bookings"
              value={stats?.totalBookings ?? 0}
            />
            <StatCard
              icon="🕒"
              title="Upcoming Flights"
              value={stats?.upcomingFlights ?? 0}
            />
            <StatCard
              icon="💳"
              title="Wallet Balance"
              value={money(stats?.walletBalance)}
            />
            <StatCard
              icon="💰"
              title="Total Spent"
              value={money(stats?.totalSpent)}
            />
          </section>

          {recs ? (
            <section className="ud-panel ud-recommendations">
              <h3 className="ud-rec-title">Recommended for you</h3>
              {recs.preferred_route ? (
                <p className="ud-rec-intro">
                  Based on your {recs.preferred_route.origin} →{" "}
                  {recs.preferred_route.destination} trips
                </p>
              ) : (
                <p className="ud-rec-intro">
                  Upcoming picks from across our network
                </p>
              )}
              <div className="ud-rec-grid">
                {(recs.recommended_flights || []).map((f) => (
                  <article className="ud-rec-card" key={f.id}>
                    <div className="ud-rec-card-main">
                      <span className="ud-rec-airline">{f.airline}</span>
                      <span className="ud-rec-route">
                        {f.origin} → {f.destination}
                      </span>
                      <span className="ud-rec-date">
                        {formatRecDate(f.departure_time)}
                      </span>
                      <span className="ud-rec-price">{money(f.price)}</span>
                    </div>
                    <button
                      type="button"
                      className="ud-rec-book"
                      onClick={() => navigate(`/flights/book/${f.id}`)}
                    >
                      Book
                    </button>
                  </article>
                ))}
              </div>
              {(recs.deal_flights || []).length > 0 ? (
                <>
                  <h4 className="ud-rec-deals-heading">Deals you might like</h4>
                  <div className="ud-rec-grid">
                    {recs.deal_flights.map((f) => (
                      <article
                        className="ud-rec-card ud-rec-card--deal"
                        key={f.id}
                      >
                        <div className="ud-rec-card-main">
                          <span className="ud-rec-airline">{f.airline}</span>
                          <span className="ud-rec-route">
                            {f.origin} → {f.destination}
                          </span>
                          <span className="ud-rec-date">
                            {formatRecDate(f.departure_time)}
                          </span>
                          <span className="ud-rec-price">{money(f.price)}</span>
                        </div>
                        <button
                          type="button"
                          className="ud-rec-book"
                          onClick={() => navigate(`/flights/book/${f.id}`)}
                        >
                          Book
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          <section className="ud-overview-charts">
            <div className="ud-month-bar ud-month-bar-full">
              <span className="ud-month-bar-label">Chart month:</span>
              <button
                type="button"
                className="ud-month-nav"
                onClick={() => setMonthKey((k) => shiftMonthKey(k, -1))}
                aria-label="Previous month"
              >
                ←
              </button>
              <input
                type="month"
                className="ud-month-input"
                value={monthKey}
                min="2020-01"
                max={maxMonthKey}
                onChange={(e) => {
                  if (e.target.value) setMonthKey(e.target.value);
                }}
                aria-label="Select month for dashboard charts"
              />
              <button
                type="button"
                className="ud-month-nav"
                disabled={monthKey >= maxMonthKey}
                onClick={() => setMonthKey((k) => shiftMonthKey(k, 1))}
                aria-label="Next month"
              >
                →
              </button>
              {analyticsRefreshing ? (
                <span className="ud-month-status">Updating…</span>
              ) : null}
            </div>
            <div className="ud-left-charts">
              <section
                className={`ud-panel${analyticsRefreshing ? " ud-panel--dim" : ""}`}
              >
                <h3>
                  Booking Trends{" "}
                  {bookingsMonthMeta?.monthLabel
                    ? `(${bookingsMonthMeta.monthLabel})`
                    : "(Daily)"}
                </h3>
                <BookingTrendChart data={bookingsTrendData} />
              </section>
              <section className="ud-panel">
                <h3>Booking Status</h3>
                <BookingStatusPieChart data={pieData} />
              </section>
            </div>
            <section
              className={`ud-panel${analyticsRefreshing ? " ud-panel--dim" : ""}`}
            >
              <h3>
                Spending Graph{" "}
                {spendingMonthMeta?.monthLabel
                  ? `(${spendingMonthMeta.monthLabel})`
                  : "(Daily)"}
              </h3>
              <SpendingChart data={spendingTrendData} />
            </section>
          </section>
        </>
      )}
    </>
  );
}
