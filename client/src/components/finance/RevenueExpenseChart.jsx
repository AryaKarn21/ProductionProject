import Chart from "react-apexcharts";
import { formatCurrency } from "@/lib/utils";

export default function RevenueExpenseChart({ data = [] }) {
  const options = {
    chart: { type: "bar", height: 350, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit" },
    colors: ["#22c55e", "#ef4444"],
    plotOptions: { bar: { horizontal: false, borderRadius: 8, columnWidth: "45%" } },
    dataLabels: { enabled: false },
    stroke: { show: true, width: 2, colors: ["transparent"] },
    xaxis: { categories: data.map((item) => item.month), labels: { style: { colors: "#6b7280", fontSize: "12px" } } },
    yaxis: { labels: { formatter: (value) => formatCurrency(Number(value)) } },
    grid: { borderColor: "#e5e7eb", strokeDashArray: 4 },
    legend: { position: "top", horizontalAlign: "right" },
    tooltip: { y: { formatter: (value) => formatCurrency(Number(value)) } },
  };

  const series = [
    { name: "Revenue", data: data.map((item) => Number(item.revenue || 0)) },
    { name: "Expenses", data: data.map((item) => Number(item.expenses || 0)) },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Revenue vs Expenses</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Monthly financial comparison</p>
        </div>
      </div>
      <Chart options={options} series={series} type="bar" height={360} />
    </div>
  );
}