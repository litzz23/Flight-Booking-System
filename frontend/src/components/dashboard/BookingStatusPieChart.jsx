import { Doughnut } from "react-chartjs-2";
import { baseOptions, chartColors } from "../../utils/dashboardChartTheme";

const COLORS = [chartColors.confirmed, chartColors.cancelled];

export default function BookingStatusPieChart({ data }) {
  if (!data?.length) {
    return <p className="ud-empty">No booking status data available.</p>;
  }

  const chartData = {
    labels: data.map((row) => row.name),
    datasets: [
      {
        data: data.map((row) => Number(row.value || 0)),
        backgroundColor: COLORS,
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
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
  };

  return (
    <div className="ud-chart-wrap">
      <Doughnut data={chartData} options={options} />
    </div>
  );
}
