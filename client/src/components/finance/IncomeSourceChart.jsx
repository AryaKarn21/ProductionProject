import Chart from "react-apexcharts";
import { formatCurrency } from "@/lib/utils";

export default function IncomeSourceChart({ data = [] }) {
  const labels = data.length > 0
    ? data.map((item) => item.source)
    : ["Sales", "Services", "Subscription", "Investments", "Other"];

  const series = data.length > 0
    ? data.map((item) => Number(item.amount || 0))
    : [120000, 45000, 32000, 18000, 9000];

  const options = {
    chart: { type: "pie", toolbar: { show: false } },
    labels,
    legend: { position: "bottom" },
    dataLabels: { enabled: true },
    tooltip: { y: { formatter: (value) => formatCurrency(value) } },
    responsive: [{ breakpoint: 768, options: { chart: { width: "100%" }, legend: { position: "bottom" } } }],
  };

  return (
    <div className="card p-5">
      <div className="mb-6">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Income Sources</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Distribution of revenue by source</p>
      </div>
      <Chart options={options} series={series} type="pie" height={350} />
    </div>
  );
}