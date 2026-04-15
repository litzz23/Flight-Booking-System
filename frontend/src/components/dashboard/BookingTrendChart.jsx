import { Bar } from "react-chartjs-2";
import { baseOptions, chartColors } from "../../utils/dashboardChartTheme";

export default function BookingTrendChart({ data }) {
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return <p className="ud-empty">No booking trend data available.</p>;
  }

  const labels = rows.map((row, idx) => {
    if (row.day) {
      const d = new Date(row.day);
      if (!Number.isNaN(d.getTime())) return String(d.getDate());
    }
    return row.month ?? row.label ?? row.name ?? `#${idx + 1}`;
  });
  const values = rows.map((row) =>
    Number(row.count ?? row.total ?? row.value ?? row.bookings ?? 0),
  );

  const chartData = {
    labels,
    datasets: [
      {
        label: "Bookings",
        data: values,
        backgroundColor: "rgba(138, 180, 248, 0.78)",
        borderRadius: 8,
        maxBarThickness: 34,
      },
    ],
  };

  const options = {
    ...baseOptions(),
    plugins: {
      ...baseOptions().plugins,
      legend: {
        display: false,
      },
      tooltip: {
        ...baseOptions().plugins.tooltip,
        callbacks: {
          title: (items) => {
            const i = items[0]?.dataIndex;
            const row = rows[i];
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
          text: rows.some((r) => r?.day) ? "Day of month" : "Month",
          color: chartColors.axis,
          font: { size: 11 },
        },
        grid: {
          color: chartColors.grid,
        },
        ticks: {
          color: chartColors.axis,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: rows.some((r) => r?.day) ? 16 : undefined,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: chartColors.grid,
        },
        ticks: {
          color: chartColors.axis,
          precision: 0,
        },
      },
    },
  };

  return (
    <div className="ud-chart-wrap">
      <Bar data={chartData} options={options} />
    </div>
  );
}
