import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Users,
} from "lucide-react";
import { attendanceAPI } from "@/api/attendance.api";
import { employeesAPI } from "@/api/employees.api";
import Avatar from "@/components/ui/Avatar";

/*
|--------------------------------------------------------------------------
| Attendance Register
|--------------------------------------------------------------------------
|
| The standard HR paper-register layout: one row per employee, one column
| per calendar day, a short code per cell (P/LT/HD/A/H/LV/WO), totals on
| the right. Spans 2 calendar months by default (this month + last month).
|
| Days with no Attendance row are resolved live using the exact same
| precedence as the nightly auto-absent job (services/attendanceFinalization
| .service.js) — so a day shows correctly here even before the 00:15 cron
| has caught up to it. See server/services/attendanceRegister.service.js.
*/

const CODE_STYLE = {
  P: "bg-emerald-500/15 text-emerald-400",
  LT: "bg-amber-500/15 text-amber-400",
  HD: "bg-sky-500/15 text-sky-400",
  A: "bg-rose-500/15 text-rose-400",
  H: "bg-violet-500/15 text-violet-400",
  LV: "bg-indigo-500/15 text-indigo-400",
  WO: "bg-slate-700/40 text-slate-500",
  "—": "bg-transparent text-slate-700",
};

function monthParam(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function AttendanceRegister() {
  const [endMonth, setEndMonth] = useState(() => monthParam(new Date()));
  const [span, setSpan] = useState(2);
  const [department, setDepartment] = useState("");

  const { data: employeesResp } = useQuery({
    queryKey: ["employees-for-register"],
    queryFn: () => employeesAPI.getAll({ limit: 500 }).then((r) => r.data),
  });
  const departments = useMemo(() => {
    const list = employeesResp?.employees || employeesResp?.data || [];
    return [...new Set(list.map((e) => e.department).filter(Boolean))].sort();
  }, [employeesResp]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["attendance-register", endMonth, span, department],
    queryFn: () =>
      attendanceAPI
        .getRegister({ endMonth, months: span, department: department || undefined })
        .then((r) => r.data),
  });

  const shiftMonth = (delta) => {
    const [y, m] = endMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setEndMonth(monthParam(d));
  };

  const handleExportCsv = () => {
    if (!data?.employees?.length) return;
    const allDates = data.months.flatMap((m) => m.dates);
    const header = ["Employee", "Employee ID", "Department", ...allDates, "Present", "Late", "Half Day", "Absent", "Leave", "Attendance %"];
    const rows = data.employees.map((row) => [
      row.employee.name,
      row.employee.employeeCode || "",
      row.employee.department || "",
      ...allDates.map((d) => row.days[d] || ""),
      row.totals.present,
      row.totals.late,
      row.totals.halfDay,
      row.totals.absent,
      row.totals.leave,
      row.totals.attendancePct != null ? `${row.totals.attendancePct}%` : "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-register-${data.rangeStart}_to_${data.rangeEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full animate-fade-in print:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-4 border-b border-slate-800/80 print:hidden">
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">Attendance Register</h1>
          <p className="text-xs text-slate-400 mt-1">
            Standard employee-by-day register. Days with no punch are auto-marked
            absent, matching the nightly finalization job.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={span}
            onChange={(e) => setSpan(Number(e.target.value))}
            className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
          >
            <option value={1}>1 month</option>
            <option value={2}>2 months</option>
            <option value={3}>3 months</option>
          </select>

          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => shiftMonth(-1)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              title="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[11px] font-semibold text-slate-300 px-1 tabular-nums">
              {endMonth}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              title="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <button
            onClick={handleExportCsv}
            disabled={!data?.employees?.length}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700 disabled:opacity-40"
          >
            <Download size={13} /> CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-700"
          >
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="h-64 rounded-xl bg-slate-900/50 border border-slate-800 animate-pulse" />
      )}

      {isError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
          <AlertTriangle size={20} className="mx-auto text-rose-400 mb-2" />
          <p className="text-sm font-semibold text-white">Could not load the register</p>
          <p className="text-xs text-slate-400 mt-1">
            {error?.response?.data?.message || "Please try again."}
          </p>
        </div>
      )}

      {!isLoading && !isError && data && (
        <>
          {data.employees.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
              <Users size={20} className="mx-auto text-slate-600 mb-2" />
              <p className="text-sm text-slate-400">No employees match this filter.</p>
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 print:hidden">
                {Object.entries(data.legend || {}).map(([code, label]) => (
                  <span key={code} className="flex items-center gap-1.5">
                    <span
                      className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold ${CODE_STYLE[code] || "bg-slate-800 text-slate-400"}`}
                    >
                      {code || "·"}
                    </span>
                    {label}
                  </span>
                ))}
              </div>

              {/* Register table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="text-left text-[11px] border-collapse">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider">
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-950/95 p-2.5 border-b border-r border-slate-800 min-w-[180px]">
                          Employee
                        </th>
                        {data.months.map((m) => (
                          <th
                            key={`${m.year}-${m.month}`}
                            colSpan={m.days}
                            className="p-2 border-b border-l border-slate-800 text-center font-semibold text-slate-300"
                          >
                            {m.label}
                          </th>
                        ))}
                        <th colSpan={5} className="p-2 border-b border-l border-slate-800 text-center font-semibold text-slate-300">
                          Totals
                        </th>
                      </tr>
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-950/95 p-1.5 border-b border-r border-slate-800" />
                        {data.months.flatMap((m) =>
                          m.dates.map((d) => (
                            <th key={d} className="p-1 border-b border-slate-800/60 text-center font-normal w-6">
                              {Number(d.slice(-2))}
                            </th>
                          ))
                        )}
                        {["P", "LT", "HD", "A", "%"].map((h) => (
                          <th key={h} className="p-1.5 border-b border-l border-slate-800 text-center font-semibold text-slate-300 w-9">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {data.employees.map((row) => (
                        <tr key={row.employee.id} className="hover:bg-slate-800/20">
                          <td className="sticky left-0 z-10 bg-slate-900 group-hover:bg-slate-800/20 p-2 border-r border-slate-800 flex items-center gap-2 min-w-[180px]">
                            <Avatar src={row.employee.avatar} name={row.employee.name} size="xs" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-200 truncate">{row.employee.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {row.employee.department || "—"}
                              </p>
                            </div>
                          </td>
                          {data.months.flatMap((m) =>
                            m.dates.map((d) => {
                              const code = row.days[d];
                              return (
                                <td key={d} className="p-0.5 text-center">
                                  {code ? (
                                    <span
                                      className={`inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold ${CODE_STYLE[code] || "bg-slate-800 text-slate-400"}`}
                                      title={data.legend?.[code] || code}
                                    >
                                      {code}
                                    </span>
                                  ) : (
                                    <span className="inline-block w-5 h-5" />
                                  )}
                                </td>
                              );
                            })
                          )}
                          <td className="p-1.5 border-l border-slate-800 text-center tabular-nums text-emerald-400 font-semibold">
                            {row.totals.present}
                          </td>
                          <td className="p-1.5 text-center tabular-nums text-amber-400">
                            {row.totals.late}
                          </td>
                          <td className="p-1.5 text-center tabular-nums text-sky-400">
                            {row.totals.halfDay}
                          </td>
                          <td className="p-1.5 text-center tabular-nums text-rose-400 font-semibold">
                            {row.totals.absent}
                          </td>
                          <td className="p-1.5 text-center tabular-nums text-slate-300 font-semibold">
                            {row.totals.attendancePct != null ? `${row.totals.attendancePct}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}