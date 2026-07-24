import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  TrendingUp,
  Users,
  Activity,
  Target,
  Download,
} from "lucide-react";
import toast from "react-hot-toast";

import { reportsAPI } from "@/api/reports.api";
import StatCard from "@/components/shared/StatCard";
import ChartWidget from "@/components/shared/ChartWidget";
import { formatCurrency } from "@/lib/utils";

// Helper header treatment for dashboard panels
function PanelHeader({ title, subtitle, icon: Icon, iconClass }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4 sm:mb-5">
      <div className="min-w-0">
        <h3
          className="text-[15px] sm:text-lg font-semibold truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        <p className="text-[12px] sm:text-sm" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      </div>
      <Icon size={20} className={`${iconClass} shrink-0`} />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="h-[240px] sm:h-[300px] animate-pulse rounded-xl"
      style={{ background: "var(--border)" }}
    />
  );
}

// Progress row for pipeline and lead sources
function ProgressRow({ label, valueText, percent, barColor }) {
  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-1.5">
        <span
          className="text-[12px] sm:text-sm font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </span>
        <span
          className="text-[12px] sm:text-sm shrink-0"
          style={{ color: "var(--text-secondary)" }}
        >
          {valueText}
        </span>
      </div>
      <div className="w-full h-2 rounded-full" style={{ background: "var(--border)" }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${Math.min(Math.max(Number(percent) || 0, 0), 100)}%`,
            background: barColor,
          }}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);

  const { data, isLoading } = useQuery({
    queryKey: ["reports-dashboard-stats"],
    queryFn: () => reportsAPI.getDashboardStats().then((res) => res.data),
  });

  const { data: revenueData, isLoading: revenueLoading } = useQuery({
    queryKey: ["revenue-by-month", year],
    queryFn: () => reportsAPI.getRevenueByMonth(year).then((res) => res.data),
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery({
    queryKey: ["sales-forecast"],
    queryFn: () => reportsAPI.getSalesForecast().then((res) => res.data),
  });

  const revenueRows = revenueData?.data || [];
  const forecastRows = forecastData?.data || [];
  const pipeline = Array.isArray(data?.pipeline) ? data.pipeline : [];
  const leadSources = Array.isArray(data?.leadSources) ? data.leadSources : [];

  // ================= APEXCHARTS CONFIG OPTIONS =================
  const revenueChartOptions = {
    chart: {
      type: "area",
      toolbar: { show: true, tools: { download: true, zoom: true, pan: true, reset: true } },
      zoom: { enabled: true },
      animations: { enabled: true, easing: "easeinout", speed: 800 },
    },
    stroke: { curve: "smooth", width: 3 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 90, 100],
      },
    },
    colors: ["#10B981"], // Emerald Green accent
    dataLabels: { enabled: false },
    tooltip: {
      theme: "dark",
      y: { formatter: (val) => formatCurrency(val) },
    },
    grid: { borderColor: "var(--border)", strokeDashArray: 4 },
  };

  const forecastChartOptions = {
    chart: {
      type: "area",
      toolbar: { show: false },
      animations: { enabled: true, speed: 600 },
    },
    stroke: { curve: "stepline", width: 2 },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.5,
        opacityTo: 0.1,
      },
    },
    colors: ["#F59E0B"], // Amber Gold
    dataLabels: { enabled: false },
    tooltip: {
      theme: "dark",
      y: { formatter: (val) => formatCurrency(val) },
    },
    grid: { borderColor: "var(--border)", strokeDashArray: 4 },
  };

  // Export handling
  const handleExport = () => {
    try {
      const esc = (v) => {
        if (v == null) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const section = (title, headers, rows) =>
        [`===== ${title} =====`, headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join(
          "\n"
        );

      const csv = [
        "ANALYTICS REPORT",
        `Generated,${new Date().toISOString()}`,
        `Year,${year}`,
        "",
        section(
          "SUMMARY",
          ["Metric", "Value"],
          [
            ["Total Revenue", data?.totalRevenue ?? 0],
            ["Won Deals", data?.wonDeals ?? 0],
            ["Employees", data?.employees ?? 0],
            ["Open Tickets", data?.openTickets ?? 0],
          ]
        ),
        "",
        section(
          "REVENUE BY MONTH",
          ["Month", "Revenue"],
          revenueRows.map((r) => [r.month, r.revenue])
        ),
        "",
        section(
          "SALES FORECAST",
          ["Month", "Forecast"],
          forecastRows.map((r) => [r.month, r.forecast])
        ),
        "",
        section(
          "PIPELINE",
          ["Stage", "Value", "Percent"],
          pipeline.map((p) => [p.name, p.value, p.percent])
        ),
        "",
        section(
          "LEAD SOURCES",
          ["Source", "Leads", "Percent"],
          leadSources.map((s) => [s.source, s.count, s.percent])
        ),
      ].join("\n");

      const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics-${year}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report exported");
    } catch {
      toast.error("Export failed");
    }
  };

  const stats = [
    {
      title: "Revenue",
      value: formatCurrency(data?.totalRevenue || 0),
      icon: DollarSign,
      color: "success",
      change: data?.revenueGrowth,
      label: "vs last year",
    },
    {
      title: "Won Deals",
      value: data?.wonDeals ?? 0,
      icon: TrendingUp,
      color: "primary",
      change: data?.dealsGrowth,
      label: "this month",
    },
    {
      title: "Employees",
      value: data?.employees ?? 0,
      icon: Users,
      color: "info",
    },
    {
      title: "Open Tickets",
      value: data?.openTickets ?? 0,
      icon: Activity,
      color: "warning",
      change: data?.ticketChange,
      label: "today",
    },
  ];

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="animate-fade-in">
      {/* ================= HEADER ================= */}
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          <h1
            className="text-[18px] sm:text-[24px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Analytics Dashboard
          </h1>
          <p className="text-[12px] sm:text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            Business intelligence across all CRM modules
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <select
            className="input w-full sm:w-auto"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="Select year"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            className="btn btn-primary w-full sm:w-auto justify-center"
            onClick={handleExport}
          >
            <Download size={16} /> Export Report
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* ================= KPI CARDS ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((card, index) => (
            <StatCard
              key={index}
              title={card.title}
              value={card.value}
              icon={card.icon}
              color={card.color}
              change={card.change}
              changeLabel={card.label}
              loading={isLoading}
            />
          ))}
        </div>

        {/* ================= MAIN DASHBOARD GRID ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          
          {/* Revenue Trend Area Chart */}
          <div
            className="card p-4 sm:p-6 rounded-2xl shadow-sm border overflow-hidden lg:col-span-2"
            style={{ borderColor: "var(--border)" }}
          >
            <PanelHeader
              title="Revenue Trend"
              subtitle={`Monthly revenue performance for ${year}`}
              icon={TrendingUp}
              iconClass="text-emerald-500"
            />
            {revenueLoading ? (
              <ChartSkeleton />
            ) : revenueRows.length ? (
              <ChartWidget
                type="apex-area"
                title=""
                data={revenueRows}
                dataKey="revenue"
                xKey="month"
                height={320}
                options={revenueChartOptions}
                formatter={(v) => formatCurrency(v)}
              />
            ) : (
              <div className="py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                No revenue recorded for {year}.
              </div>
            )}
          </div>

          {/* Sales Forecast Chart */}
          <div
            className="card p-4 sm:p-6 rounded-2xl shadow-sm border overflow-hidden"
            style={{ borderColor: "var(--border)" }}
          >
            <PanelHeader
              title="Sales Forecast"
              subtitle="Expected sales performance"
              icon={TrendingUp}
              iconClass="text-amber-500"
            />
            {forecastLoading ? (
              <ChartSkeleton />
            ) : forecastRows.length ? (
              <ChartWidget
                type="apex-area"
                title=""
                data={forecastRows}
                dataKey="forecast"
                xKey="month"
                height={280}
                options={forecastChartOptions}
                formatter={(v) => formatCurrency(v)}
              />
            ) : (
              <div className="py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                No forecast data available.
              </div>
            )}
          </div>

          {/* Pipeline Stage Column */}
          <div
            className="card p-4 sm:p-6 rounded-2xl shadow-sm border"
            style={{ borderColor: "var(--border)" }}
          >
            <PanelHeader
              title="Pipeline by Stage"
              subtitle="Current opportunity pipeline"
              icon={Target}
              iconClass="text-purple-500"
            />
            {pipeline.length ? (
              <div className="space-y-4 pt-2">
                {pipeline.map((stage, index) => (
                  <ProgressRow
                    key={index}
                    label={stage.name}
                    valueText={formatCurrency(stage.value)}
                    percent={stage.percent}
                    barColor="var(--primary)"
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-[13px]" style={{ color: "var(--text-muted)" }}>
                No pipeline data available.
              </div>
            )}
          </div>

          {/* Lead Sources */}
          <div
            className="card p-4 sm:p-6 rounded-2xl shadow-sm border lg:col-span-2"
            style={{ borderColor: "var(--border)" }}
          >
            <PanelHeader
              title="Lead Sources"
              subtitle="Leads generated from different channels"
              icon={Users}
              iconClass="text-indigo-500"
            />
            {leadSources.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2">
                {leadSources.map((source, index) => (
                  <ProgressRow
                    key={index}
                    label={source.source}
                    valueText={`${source.count} Leads`}
                    percent={source.percent}
                    barColor="var(--success)"
                  />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                No lead source data available.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}