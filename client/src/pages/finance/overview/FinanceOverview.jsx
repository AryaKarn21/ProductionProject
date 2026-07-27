import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { 
  DollarSign, 
  Wallet, 
  TrendingUp, 
  Landmark, 
  Download, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight,
  Building2,
  Calendar
} from "lucide-react";

import { financeAPI } from "@/api/finance.api";
import { formatCurrency } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";

import FinanceKPICard from "@/components/finance/FinanceKPICard";
import RevenueExpenseChart from "@/components/finance/RevenueExpenseChart";
import CashFlowChart from "@/components/finance/CashFlowChart";
import ExpenseCategoryChart from "@/components/finance/ExpenseCategoryChart";
import IncomeSourceChart from "@/components/finance/IncomeSourceChart";
import LedgerModal from "@/pages/finance/ledger/LedgerModal";

export default function FinanceOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { user, activeCompany, companies } = useAuthStore();

  const createMutation = useMutation({
    mutationFn: financeAPI.createEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["finance-overview"] });
      setModalOpen(false);
      toast.success("Transaction recorded successfully");
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || "Failed to record transaction"),
  });

  const companyName =
    (Array.isArray(companies) && companies.find((c) => c.id === activeCompany)?.name) ||
    user?.companyName ||
    "OS Group of Companies";

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await financeAPI.getLedgerEntries({ limit: 5000, page: 1 });
      const entries = res.data?.entries || res.data?.ledger || [];
      const header = ["Date", "Description", "Type", "Category", "Account", "Amount", "Currency", "Reference", "Notes"];
      const csvRows = entries.map((e) => [
        e.date ? new Date(e.date).toISOString().slice(0, 10) : "",
        (e.description || "").replace(/[",\r\n]/g, " "),
        e.type || "",
        e.category || "",
        e.accountName || e.account?.name || "",
        e.amount ?? "",
        e.currency || "NPR",
        e.reference || "",
        (e.notes || "").replace(/[",\r\n]/g, " "),
      ]);
      const csv = [header, ...csvRows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-statement-${companyName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${entries.length} entries`);
    } catch {
      toast.error("Export failed — please try again");
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["finance-overview"],
    queryFn: () => financeAPI.getOverview().then((r) => r.data),
  });

  const { data: monthlyRevenue, isLoading: chartLoading } = useQuery({
    queryKey: ["monthly-revenue"],
    queryFn: () => financeAPI.getReports("revenue-by-month").then((r) => r.data),
  });

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in">
      {/* ── Page Header Bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">Finance Overview</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
              <Building2 size={12} className="text-blue-400" />
              {companyName}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time balance sheets, income sources, and liquidity analytics
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <Calendar size={13} className="text-slate-500" />
            <span>YTD 2026</span>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-60"
          >
            <Download size={14} className="text-slate-400" />
            {exporting ? "Exporting..." : "Export Statement"}
          </button>

          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-950 transition-colors"
          >
            <Plus size={15} /> Record Transaction
          </button>
        </div>
      </div>

      {/* ── High-Impact KPI Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
        <FinanceKPICard
          title="Total Revenue"
          value={isLoading ? "—" : formatCurrency(data?.revenue || 0)}
          icon={TrendingUp}
          color="emerald"
          growth={data?.revenueChange || 0}
          timeframe="vs last period"
        />
        <FinanceKPICard
          title="Total Expenses"
          value={isLoading ? "—" : formatCurrency(data?.expenses || 0)}
          icon={Wallet}
          color="rose"
          growth={data?.expensesChange || 0}
          timeframe="vs last period"
        />
        <FinanceKPICard
          title="Net Profit"
          value={isLoading ? "—" : formatCurrency(data?.profit || 0)}
          icon={DollarSign}
          color="blue"
          growth={data?.profitChange || 0}
          timeframe="vs target"
        />
        <FinanceKPICard
          title="Cash Balance"
          value={
            isLoading
              ? "—"
              : formatCurrency(data?.cashBalance ?? data?.payables ?? -88555)
          }
          icon={Landmark}
          color="purple"
          growth={data?.cashBalanceChange || 0}
          timeframe="liquid position"
        />
      </div>

      {/* ── Main Analytical Charts Area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 min-w-0 shadow-sm">
          <RevenueExpenseChart data={monthlyRevenue?.data || []} loading={chartLoading} />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 min-w-0 shadow-sm">
          <CashFlowChart data={monthlyRevenue?.data || []} loading={chartLoading} />
        </div>
      </div>

      {/* ── Secondary Distributions Area ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 min-w-0 shadow-sm">
          <ExpenseCategoryChart />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 min-w-0 shadow-sm">
          <IncomeSourceChart />
        </div>
      </div>

      {/* ── Recent Financial Ledger Table ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Recent General Ledger Activity
            </h3>
            <p className="text-[11px] text-slate-500">Latest entries across accounts</p>
          </div>
          <button
            onClick={() => navigate("/finance/ledger")}
            className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
          >
            View All Ledger Entries →
          </button>
        </div>

        <div className="divide-y divide-slate-800/60 overflow-x-auto">
          {data?.recentTransactions?.length ? (
            data.recentTransactions.map((tx, index) => (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {tx.description}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {tx.category} • {tx.date}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tx.type === "income" ? (
                    <ArrowUpRight size={14} className="text-emerald-400" />
                  ) : (
                    <ArrowDownRight size={14} className="text-rose-400" />
                  )}
                  <span
                    className={`text-xs font-bold ${
                      tx.type === "income" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {formatCurrency(Math.abs(tx.amount))}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-5 py-10 text-center text-xs text-slate-500">
              No recent ledger entries found for this enterprise profile.
            </div>
          )}
        </div>
      </div>
      {/* ── Record Transaction Modal ── */}
      <LedgerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
        loading={createMutation.isPending}
      />
    </div>
  );
}