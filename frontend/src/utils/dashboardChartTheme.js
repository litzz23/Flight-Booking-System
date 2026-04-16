import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

export const chartColors = {
  axis: "#9aa1b5",
  grid: "rgba(255,255,255,0.08)",
  tooltipBg: "rgba(24,24,36,0.96)",
  tooltipText: "#e8eaed",
  bookingLine: "#8ab4f8",
  spendingBar: "#7bd88f",
  confirmed: "#7bd88f",
  cancelled: "#f08a8a",
};

export function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 700,
      easing: "easeOutQuart",
    },
    plugins: {
      legend: {
        labels: {
          color: chartColors.axis,
          boxWidth: 12,
          boxHeight: 12,
          font: {
            family: "Inter, sans-serif",
            size: 12,
          },
        },
      },
      tooltip: {
        backgroundColor: chartColors.tooltipBg,
        borderColor: "rgba(138, 180, 248, 0.25)",
        borderWidth: 1,
        titleColor: chartColors.tooltipText,
        bodyColor: chartColors.tooltipText,
        displayColors: false,
      },
    },
  };
}
