import Chart from "react-apexcharts";
import { formatCurrency } from "@/lib/utils";

export default function RevenueExpenseChart({ data = [], loading = false }) {
  // Chart configuration tuned for dark / enterprise themes
  const options = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: "Inter, system-ui, sans-serif",
      background: "transparent",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 500,
      },
    },

    // Refined enterprise colors (Emerald for Revenue, Crimson for Expenses)
    colors: ["#10b981", "#f43f5e"],

    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "40%",
        borderRadius: 4,
        borderRadiusApplication: "end", // Only round top corners
      },
    },

    dataLabels: { enabled: false },

    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },

    xaxis: {
      categories: data.length > 0 ? data.map((item) => item.month) : ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: "#94a3b8", // Slate-400 for high visibility
          fontSize: "11px",
          fontWeight: 500,
        },
      },
    },

    yaxis: {
      labels: {
        style: {
          colors: "#94a3b8",
          fontSize: "11px",
          fontWeight: 500,
        },
        formatter: (value) => {
          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
          if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
          return value;
        },
      },
    },

    legend: {
      position: "top",
      horizontalAlign: "right",
      fontSize: "12px",
      fontWeight: 500,
      labels: {
        colors: "#cbd5e1", // Slate-300
      },
      markers: {
        width: 8,
        height: 8,
        radius: 12,
      },
      itemMargin: {
        horizontal: 10,
      },
    },

    tooltip: {
      theme: "dark",
      style: {
        fontSize: "12px",
        fontFamily: "inherit",
      },
      y: {
        formatter: (value) => formatCurrency(value),
      },
    },

    grid: {
      borderColor: "rgba(255, 255, 255, 0.06)", // Subtle glass gridline
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 0, right: 10, bottom: 0, left: 10 },
    },

    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "vertical",
        shadeIntensity: 0.2,
        gradientToColors: ["#34d399", "#fb7185"],
        inverseColors: false,
        opacityFrom: 0.95,
        opacityTo: 0.8,
        stops: [0, 100],
      },
    },
  };

  const series = [
    {
      name: "Revenue",
      data: data.length > 0 ? data.map((item) => item.revenue) : [0, 0, 0, 0, 0, 0],
    },
    {
      name: "Expenses",
      data: data.length > 0 ? data.map((item) => item.expenses) : [0, 0, 0, 0, 0, 0],
    },
  ];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-sm font-bold text-white tracking-tight">
            Revenue vs Expenses
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Monthly cash inflow vs operational costs comparison
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Net Margin +18.4%
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-[320px] flex items-center justify-center text-xs text-slate-500 animate-pulse">
          Loading financial comparison...
        </div>
      ) : (
        <Chart options={options} series={series} type="bar" height={320} />
      )}
    </div>
  );
}