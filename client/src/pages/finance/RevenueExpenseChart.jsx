import Chart from "react-apexcharts";
import { formatCurrency } from "@/lib/utils";

export default function ExpenseCategoryChart({ data = [] }) {
  const categories = data.length > 0
    ? data.map((item) => item.category)
    : ["Salary", "Rent", "Utilities", "Marketing", "Travel"];

  const amounts = data.length > 0
    ? data.map((item) => Number(item.amount || 0))
    : [45000, 12000, 8000, 15000, 5000];

  const options = {
    chart: { type: "donut", toolbar: { show: false } },
    labels: categories,
    legend: { position: "bottom" },
    dataLabels: { enabled: true },
    tooltip: { y: { formatter: (value) => formatCurrency(value) } },
    responsive: [{ breakpoint: 768, options: { legend: { position: "bottom" } } }],
  };

  return (
    <div className="card p-5">
      <div className="mb-6">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Expense Categories</h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Distribution of expenses by category</p>
      </div>
      <Chart options={options} series={amounts} type="donut" height={350} />
    </div>
  );
}