import { useEffect, useRef, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { adminStatsApi } from "../../services/adminApi";
import StatCard from "../../components/admin/StatCard";
import ChartCard from "../../components/admin/ChartCard";
import { baseOptions, chartColors } from "../../utils/dashboardChartTheme";

function money(v) {
  return "NPR " + Number(v || 0).toLocaleString();
}

const PIE_COLORS = [chartColors.confirmed, chartColors.cancelled];

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

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsRefreshing, setAnalyticsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const statsLoadedRef = useRef(false);

  const maxMonthKey = currentMonthKey();
  const bookingsDayMeta =
    analytics?.bookingsDayMonthMeta || analytics?.bookings_day_month_meta;
  const bookingsDailyData =
    analytics?.bookingsPerDayInMonth || analytics?.bookings_per_day_in_month || [];
  const revenueDailyData =
    analytics?.revenuePerDayInMonth || analytics?.revenue_per_day_in_month || [];
  const bookingStatusData =
    analytics?.bookingStatus || analytics?.booking_status || [];

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
            adminStatsApi.getStats(),
            adminStatsApi.getAnalytics({ year: y, month: m }),
          ]);
          if (cancelled) return;
          setStats(statsData);
          setAnalytics(analyticsData);
          statsLoadedRef.current = true;
        } else {
          const analyticsData = await adminStatsApi.getAnalytics({
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
              "Failed to load admin dashboard.",
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

  return (
    <>
      <header className="ad-title-row">
        <h1>Admin Dashboard</h1>
        <p>System analytics and platform health.</p>
      </header>
      {error ? <p className="ad-error">{error}</p> : null}
      {loading ? <p className="ad-empty">Loading dashboard...</p> : null}
      {!loading && !error ? (
        <>
          <section className="ad-stats-grid">
            <StatCard
              icon="👥"
              title="Total Users"
              value={stats?.totalUsers ?? 0}
            />
            <StatCard
              icon="✈"
              title="Total Flights"
              value={stats?.totalFlights ?? 0}
            />
            <StatCard
              icon="📕"
              title="Total Bookings"
              value={stats?.totalBookings ?? 0}
            />
            <StatCard
              icon="💰"
              title="Total Revenue"
              value={money(stats?.totalRevenue)}
            />
          </section>
          <section className="ad-grid-2">
            <div className="ad-bookings-toolbar ad-month-bar-full">
              <span className="ad-month-bar-label">Bookings & revenue ·</span>
              <button
                type="button"
                className="ad-month-nav"
                onClick={() => setMonthKey((k) => shiftMonthKey(k, -1))}
                aria-label="Previous month"
              >
                ←
              </button>
              <input
                type="month"
                className="ad-month-input"
                value={monthKey}
                min="2020-01"
                max={maxMonthKey}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setMonthKey(v);
                }}
                aria-label="Select month for charts"
              />
              <button
                type="button"
                className="ad-month-nav"
                disabled={monthKey >= maxMonthKey}
                onClick={() => setMonthKey((k) => shiftMonthKey(k, 1))}
                aria-label="Next month"
              >
                →
              </button>
              {analyticsRefreshing ? (
                <span className="ad-month-status">Updating…</span>
              ) : null}
            </div>
            <ChartCard
              title={`Bookings · ${bookingsDayMeta?.monthLabel ?? "Month"} (daily)`}
            >
              <div
                className={`ad-chart-wrap${analyticsRefreshing ? " ad-chart-wrap--dim" : ""}`}
              >
                <Bar
                  data={{
                    labels: bookingsDailyData.map((row) => {
                      const d = new Date(row.day);
                      return Number.isNaN(d.getTime())
                        ? ""
                        : String(d.getDate());
                    }),
                    datasets: [
                      {
                        label: "Bookings",
                        data: bookingsDailyData.map((row) =>
                          Number(
                            row.count ??
                              row.total ??
                              row.value ??
                              row.bookings ??
                              0,
                          ),
                        ),
                        backgroundColor: "rgba(138, 180, 248, 0.78)",
                        borderRadius: 8,
                        maxBarThickness: 22,
                      },
                    ],
                  }}
                  options={{
                    ...baseOptions(),
                    plugins: {
                      ...baseOptions().plugins,
                      legend: { display: false },
                      tooltip: {
                        ...baseOptions().plugins.tooltip,
                        callbacks: {
                          title: (items) => {
                            const i = items[0]?.dataIndex;
                            const row = bookingsDailyData[i];
                            if (!row?.day) return "";
                            const d = new Date(row.day);
                            return d.toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            });
                          },
                          label: (ctx) => `Bookings: ${ctx.parsed.y}`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: "Day of month",
                          color: chartColors.axis,
                          font: { size: 11 },
                        },
                        grid: { color: chartColors.grid },
                        ticks: {
                          color: chartColors.axis,
                          maxRotation: 0,
                          autoSkip: true,
                          maxTicksLimit: 16,
                        },
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: chartColors.grid },
                        ticks: { color: chartColors.axis, precision: 0 },
                      },
                    },
                  }}
                />
              </div>
            </ChartCard>
            <ChartCard
              title={`Revenue · ${bookingsDayMeta?.monthLabel ?? "Month"} (daily)`}
            >
              <div
                className={`ad-chart-wrap${analyticsRefreshing ? " ad-chart-wrap--dim" : ""}`}
              >
                <Line
                  data={{
                    labels: revenueDailyData.map((row) => {
                      const d = new Date(row.day);
                      return Number.isNaN(d.getTime())
                        ? ""
                        : String(d.getDate());
                    }),
                    datasets: [
                      {
                        label: "Revenue (NPR)",
                        data: revenueDailyData.map((row) =>
                          Number(row.total ?? row.value ?? row.amount ?? 0),
                        ),
                        borderColor: chartColors.bookingLine,
                        backgroundColor: "rgba(138, 180, 248, 0.18)",
                        borderWidth: 2,
                        fill: true,
                        tension: 0.35,
                        pointRadius: 2,
                        pointHoverRadius: 5,
                        pointBackgroundColor: chartColors.bookingLine,
                      },
                    ],
                  }}
                  options={{
                    ...baseOptions(),
                    plugins: {
                      ...baseOptions().plugins,
                      legend: { display: false },
                      tooltip: {
                        ...baseOptions().plugins.tooltip,
                        callbacks: {
                          title: (items) => {
                            const i = items[0]?.dataIndex;
                            const row = revenueDailyData[i];
                            if (!row?.day) return "";
                            const d = new Date(row.day);
                            return d.toLocaleDateString("en-GB", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            });
                          },
                          label: (ctx) =>
                            `NPR ${Number(ctx.parsed.y || 0).toLocaleString()}`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: "Day of month",
                          color: chartColors.axis,
                          font: { size: 11 },
                        },
                        grid: { color: chartColors.grid },
                        ticks: {
                          color: chartColors.axis,
                          maxRotation: 0,
                          autoSkip: true,
                          maxTicksLimit: 16,
                        },
                      },
                      y: {
                        beginAtZero: true,
                        grid: { color: chartColors.grid },
                        ticks: {
                          color: chartColors.axis,
                          callback: (value) =>
                            `NPR ${Number(value).toLocaleString()}`,
                        },
                      },
                    },
                  }}
                />
              </div>
            </ChartCard>
          </section>
          <ChartCard
            title={`Booking status · ${bookingsDayMeta?.monthLabel ?? "Month"}`}
          >
            <div
              className={`ad-chart-wrap${analyticsRefreshing ? " ad-chart-wrap--dim" : ""}`}
            >
              <Doughnut
                data={{
                  labels: bookingStatusData.map(
                    (row, idx) => row.name ?? row.label ?? `Item ${idx + 1}`,
                  ),
                  datasets: [
                    {
                      data: bookingStatusData.map((row) =>
                        Number(row.value ?? row.total ?? row.count ?? 0),
                      ),
                      backgroundColor: PIE_COLORS,
                      borderWidth: 0,
                      hoverOffset: 4,
                    },
                  ],
                }}
                options={{
                  ...baseOptions(),
                  cutout: "58%",
                  plugins: {
                    ...baseOptions().plugins,
                    legend: {
                      ...baseOptions().plugins.legend,
                      position: "bottom",
                    },
                    tooltip: {
                      ...baseOptions().plugins.tooltip,
                      callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.parsed}`,
                      },
                    },
                  },
                }}
              />
            </div>
          </ChartCard>
        </>
      ) : null}
    </>
  );
}
