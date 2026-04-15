import { Line } from "react-chartjs-2";
import { baseOptions, chartColors } from "../../utils/dashboardChartTheme";

export default function SpendingChart({ data }) {
  if (!data?.length) {
    return <p className="ud-empty">No spending data available.</p>;
  }

  const labels = data.map((row) => {
    const d = new Date(row.day);
    return Number.isNaN(d.getTime()) ? "" : String(d.getDate());
  });
  const values = data.map((row) => Number(row.total || 0));

  const chartData = {
    labels,
    datasets: [
      {
        label: "Spent (NPR)",
        data: values,
        borderColor: chartColors.spendingBar,
        backgroundColor: "rgba(123, 216, 143, 0.2)",
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: chartColors.spendingBar,
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
            const row = data[i];
            if (!row?.day) return "";
            const d = new Date(row.day);
            return d.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
          },
          label: (ctx) => `NPR ${Number(ctx.parsed.y || 0).toLocaleString()}`,
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
        grid: {
          color: chartColors.grid,
        },
        ticks: {
          color: chartColors.axis,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 16,
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          color: chartColors.grid,
        },
        ticks: {
          color: chartColors.axis,
          callback: (value) => `NPR ${Number(value).toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div className="ud-chart-wrap">
      <Line data={chartData} options={options} />
    </div>
  );
}
