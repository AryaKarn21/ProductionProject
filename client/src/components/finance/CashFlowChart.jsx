import Chart from "react-apexcharts";
import { formatCurrency } from "@/lib/utils";

export default function CashFlowChart({ data = [] }) {
  const cashFlow = data.map(
    (item) => Number(item.revenue || 0) - Number(item.expenses || 0)
  );

  const options = {
    chart: { type: "area", toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit" },
    colors: ["#3b82f6"],
    stroke: { curve: "smooth", width: 3 },
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } },
    dataLabels: { enabled: false },
    grid: { borderColor: "#e5e7eb", strokeDashArray: 4 },
    xaxis: { categories: data.map((item) => item.month) },
    yaxis: { labels: { formatter: (value) => formatCurrency(value) } },
    tooltip: { y: { formatter: (value) => formatCurrency(value) } },
  };

  const series = [{ name: "Cash Flow", data: cashFlow }];

  return (
    <div className="card p-5">
      <div className="mb-6">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Cash Flow</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Monthly cash flow trend</p>
      </div>
      <Chart options={options} series={series} type="area" height={360} />
    </div>
  );
}