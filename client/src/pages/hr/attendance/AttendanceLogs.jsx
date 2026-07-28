import { useMemo, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Plus,
  LogOut,
  Pencil,
  Eye,
  History,
  Check,
  X as XIcon,
  Download,
  Upload,
  RotateCcw,
  Building2,
  Calendar as CalendarIcon,
  } from "lucide-react";
import { attendanceAPI } from "@/api/attendance.api";
import { employeesAPI } from "@/api/employees.api";
import { shiftsAPI } from "@/api/shifts.api";
import { holidayAPI } from "@/api/holiday.api";
import { CalendarHeart } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import FormModal from "@/components/shared/FormModal";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import AttendanceStatCards from "@/components/hr/AttendanceStatCards";
import { formatDate, classifyStatus, formatStatusLabel } from "@/lib/utils";
import {
  computeLateMinutes,
  computeEarlyExitMinutes,
  computeOvertimeMinutes,
  formatMinutes,
  ATTENDANCE_STATUS_OPTIONS,
  APPROVAL_STATUS_OPTIONS,
  APPROVAL_VARIANT,
} from "@/lib/attendanceUtils";
import toast from "react-hot-toast";
import { useForm } from "react-hook-form";

const defaultParams = (today) => ({
  page: 1,
  limit: 25,
  search: "",
  dateFrom: today,
  dateTo: today,
  status: "",
  department: "",
  shiftId: "",
  approvalStatus: "",
});

export default function AttendanceLogs() {
  const today = format(new Date(), "yyyy-MM-dd");
  const queryClient = useQueryClient();
  const [params, setParams] = useState(defaultParams(today));

  const [checkInModal, setCheckInModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [detailsRecord, setDetailsRecord] = useState(null);
  const [correctionModal, setCorrectionModal] = useState(false);
  const [correctionRecord, setCorrectionRecord] = useState(null);
  const [pendingRowId, setPendingRowId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── Company details ────────────────────────────────────────────────────────
  const { user, activeCompany, companies } = useAuthStore();

  // ── Role check ────────────────────────────────────────────────────────────
  const PRIVILEGED_ROLES = ["super_admin", "admin", "manager", "accountant"];
  const isPrivileged = PRIVILEGED_ROLES.includes(user?.role);
  // ─────────────────────────────────────────────────────────────────────────
  const companyName =
    (Array.isArray(companies) && companies.find((c) => c.id === activeCompany)?.name) ||
    user?.companyName ||
    "OS Group of Companies";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["attendance", params],
    queryFn: () => attendanceAPI.getAll(params).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const statsFilters = {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    status: params.status,
    department: params.department,
    shiftId: params.shiftId,
    approvalStatus: params.approvalStatus,
    limit: 1000,
    page: 1,
  };

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["attendance-stats", statsFilters],
    queryFn: () => attendanceAPI.getAll(statsFilters).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const statsRecords = statsData?.attendance || [];

  const { data: empData } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => employeesAPI.getAll({ limit: 200 }).then((r) => r.data),
    enabled: isPrivileged, // employees don't need the full list
  });

  // For non-privileged users, build a fake "employees" list with just themselves
  // so the Log Attendance dropdown shows only their own name
  const selfEmployee = user?.employee?.id
    ? [{ id: user.employee.id, firstName: user.name?.split(" ")[0] || user.name || "", lastName: user.name?.split(" ").slice(1).join(" ") || "", department: user.employee.department || "" }]
    : [];
  const employees = isPrivileged
    ? (empData?.employees || [])
    : selfEmployee;
  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))],
    [employees]
  );

  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => shiftsAPI.getAll().then((r) => r.data),
  });
  const shifts = shiftData || [];

  // ── Holiday linking ─────────────────────────────────────────────────────
  // Pulls the configured company holidays for the year currently in view so
  // the attendance log can flag "this date is a holiday" even before the
  // nightly finalization job has run (it only fills in past days).
  const holidayYear = (params.dateFrom || today).slice(0, 4);
  const { data: holidayData } = useQuery({
    queryKey: ["holidays", holidayYear],
    queryFn: () => holidayAPI.getAll({ year: holidayYear }).then((r) => r.data),
  });
  const holidays = holidayData?.holidays || holidayData?.data || [];
  const isSingleDayView = !!params.dateFrom && params.dateFrom === params.dateTo;
  const selectedHoliday = isSingleDayView
    ? holidays.find((h) => h.isActive !== false && String(h.date).slice(0, 10) === params.dateFrom)
    : null;

  const {
    register: regCI,
    handleSubmit: hCI,
    reset: resetCI,
    formState: { errors: errCI },
  } = useForm({
    defaultValues: {
      employee: "",
      date: today,
      checkIn: "",
      checkOut: "",
      status: "present",
      shiftId: "",
      breakMinutes: "",
      notes: "",
    },
  });

  const { register: regEdit, handleSubmit: hEdit, reset: resetEdit } = useForm();
  const { register: regCorrection, handleSubmit: hCorrection, reset: resetCorrection } = useForm();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
    queryClient.invalidateQueries({ queryKey: ["attendance-stats"] });
  };

  const checkInMutation = useMutation({
    mutationFn: (d) => attendanceAPI.checkIn(d),
    onSuccess: () => {
      invalidateAll();
      setCheckInModal(false);
      resetCI();
      toast.success("Attendance record created");
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || "Failed to log attendance"),
  });

  const checkOutMutation = useMutation({
    mutationFn: (id) => attendanceAPI.checkOut(id),
    onMutate: (id) => setPendingRowId(id),
    onSuccess: () => { invalidateAll(); toast.success("Checked out successfully"); },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to check out"),
    onSettled: () => setPendingRowId(null),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => attendanceAPI.update(id, data),
    onSuccess: () => {
      invalidateAll();
      setEditModal(false);
      setCorrectionModal(false);
      toast.success("Record updated");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update"),
  });

  const approvalMutation = useMutation({
    mutationFn: ({ id, approvalStatus }) =>
      attendanceAPI.update(id, { approvalStatus }),
    onMutate: ({ id }) => setPendingRowId(id),
    onSuccess: (_res, { approvalStatus }) => {
      invalidateAll();
      toast.success(approvalStatus === "approved" ? "Record approved" : "Record rejected");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update status"),
    onSettled: () => setPendingRowId(null),
  });

  const openEdit = (row) => {
    setEditRecord(row);
    resetEdit({
      status: row.status || "present",
      approvalStatus: row.approvalStatus || "approved",
      shiftId: row.shift?.id || row.shiftId || "",
      breakMinutes: row.breakMinutes ?? "",
      checkIn: row.checkIn ? format(new Date(row.checkIn), "yyyy-MM-dd'T'HH:mm") : "",
      checkOut: row.checkOut ? format(new Date(row.checkOut), "yyyy-MM-dd'T'HH:mm") : "",
      notes: row.notes || "",
    });
    setEditModal(true);
  };

  const openCorrection = (row) => {
    setCorrectionRecord(row);
    resetCorrection({
      checkIn: row.checkIn ? format(new Date(row.checkIn), "yyyy-MM-dd'T'HH:mm") : "",
      checkOut: row.checkOut ? format(new Date(row.checkOut), "yyyy-MM-dd'T'HH:mm") : "",
      reason: "",
    });
    setCorrectionModal(true);
  };

  const handleFilterChange = (k, v) => setParams((p) => ({ ...p, [k]: v, page: 1 }));
  const resetFilters = () => setParams(defaultParams(today));

  const handleExport = async () => {
    setExporting(true);
    try {
      const { search, page, limit, ...filters } = params;
      const res = await attendanceAPI.getAll({ ...filters, search, limit: 5000, page: 1 });
      const rows = res.data?.attendance || [];
      const header = [
        "Employee", "Department", "Shift", "Date",
        "Check In", "Check Out", "Working Hours", "Break (min)",
        "Overtime", "Late", "Early Exit", "Status", "Approval Status", "Notes",
      ];
      const csvRows = rows.map((r) => [
        r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "",
        r.employee?.department || "",
        r.shift?.name || "Default",
        formatDate(r.date, "yyyy-MM-dd"),
        r.checkIn ? format(new Date(r.checkIn), "hh:mm a") : "",
        r.checkOut ? format(new Date(r.checkOut), "hh:mm a") : "",
        r.hoursWorked ?? "",
        r.breakMinutes ?? "",
        formatMinutes(computeOvertimeMinutes(r)),
        formatMinutes(computeLateMinutes(r)),
        formatMinutes(computeEarlyExitMinutes(r)),
        r.status || "",
        r.approvalStatus || "",
        (r.notes || "").replace(/[\r\n,]+/g, " "),
      ]);
      const csv = [header, ...csvRows]
        .map((row) => row.map((cell) => `"${cell}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${companyName.replace(/\s+/g, "-")}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} records`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const [, ...dataLines] = lines;
      let created = 0, failed = 0;
      for (const line of dataLines) {
        const [employeeId, date, status, checkIn, checkOut, notes] = line
          .split(",")
          .map((c) => c.replace(/^"|"$/g, "").trim());
        if (!employeeId || !date) { failed++; continue; }
        try {
          await attendanceAPI.checkIn({
            employeeId, date,
            status: status || "present",
            notes,
            ...(checkIn ? { checkIn: new Date(`${date}T${checkIn}`) } : {}),
            ...(checkOut ? { checkOut: new Date(`${date}T${checkOut}`) } : {}),
          });
          created++;
        } catch { failed++; }
      }
      toast.success(`Imported: ${created} created, ${failed} failed`);
      invalidateAll();
    } catch {
      toast.error("Import failed — check the CSV format");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const renderActions = (row) => {
    const busy = pendingRowId === row.id;
    return (
      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        {!row.checkOut && (
          <button
            className="px-2 py-1 text-xs font-medium rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors flex items-center gap-1"
            onClick={() => { if (confirm("Mark check-out now?")) checkOutMutation.mutate(row.id); }}
            disabled={busy} title="Check Out"
          >
            <LogOut size={12} /> Out
          </button>
        )}
        <button 
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors" 
          onClick={() => setDetailsRecord(row)} title="View Details"
        >
          <Eye size={14} />
        </button>
        <button 
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors" 
          onClick={() => openEdit(row)} title="Edit Record"
        >
          <Pencil size={14} />
        </button>
        <button 
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors" 
          onClick={() => openCorrection(row)} title="Request Correction"
        >
          <History size={14} />
        </button>
        {row.approvalStatus === "pending" && (
          <div className="flex items-center gap-1 ml-1 border-l border-slate-800 pl-1">
            <button
              className="p-1.5 text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors"
              onClick={() => approvalMutation.mutate({ id: row.id, approvalStatus: "approved" })}
              disabled={busy} title="Approve"
            >
              <Check size={14} />
            </button>
            <button
              className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
              onClick={() => approvalMutation.mutate({ id: row.id, approvalStatus: "rejected" })}
              disabled={busy} title="Reject"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: "employee", label: "Employee",
      render: (val) =>
        val ? (
          <div className="flex items-center gap-2.5 min-w-[160px]">
            <Avatar src={val.avatar} name={`${val.firstName} ${val.lastName}`} size="sm" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {val.firstName} {val.lastName}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {val.department || "—"}
              </p>
            </div>
          </div>
        ) : "—",
    },
    { key: "shift", label: "Shift", render: (val) => <span className="text-xs text-slate-300">{val?.name || "Default"}</span> },
    { key: "date", label: "Date", sortable: true, render: (val) => <span className="text-xs text-slate-300">{formatDate(val)}</span> },
    { key: "checkIn", label: "Check In", render: (val) => val ? <span className="text-xs text-slate-300">{format(new Date(val), "hh:mm a")}</span> : "—" },
    {
      key: "checkOut", label: "Check Out",
      render: (val) => val ? <span className="text-xs text-slate-300">{format(new Date(val), "hh:mm a")}</span> : <span className="text-xs text-amber-400/80 italic">Pending</span>,
    },
    {
      key: "hoursWorked", label: "Working Hours",
      render: (val) => val != null ? <span className="text-xs font-semibold text-slate-200">{Number(val).toFixed(1)}h</span> : "—",
    },
    { key: "breakMinutes", label: "Break", hideOnMobile: true, render: (val) => val != null ? <span className="text-xs text-slate-400">{formatMinutes(val)}</span> : "—" },
    { key: "overtime", label: "Overtime", render: (_val, row) => <span className="text-xs text-slate-400">{formatMinutes(computeOvertimeMinutes(row))}</span> },
    { key: "late", label: "Late", hideOnMobile: true, render: (_val, row) => <span className="text-xs text-slate-400">{formatMinutes(computeLateMinutes(row))}</span> },
    {
      key: "status", label: "Status",
      render: (val = "present") => (
        <Badge variant={classifyStatus(val)} dot>{formatStatusLabel(val)}</Badge>
      ),
    },
    {
      key: "approvalStatus", label: "Approval",
      render: (val = "approved") => (
        <Badge variant={APPROVAL_VARIANT[val] || "gray"}>{formatStatusLabel(val)}</Badge>
      ),
    },
  ];

  const mobileCard = (row) => (
    <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar src={row.employee?.avatar} name={row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"} size="sm" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-200 truncate">
              {row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {row.employee?.department || "—"} · {row.shift?.name || "Default"}
            </p>
          </div>
        </div>
        <Badge variant={classifyStatus(row.status)} dot>{formatStatusLabel(row.status)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/40 p-2 rounded-lg border border-slate-800/50 text-slate-400">
        <div>In: <span className="text-slate-200 font-medium">{row.checkIn ? format(new Date(row.checkIn), "hh:mm a") : "—"}</span></div>
        <div className="text-right">Out: <span className="text-slate-200 font-medium">{row.checkOut ? format(new Date(row.checkOut), "hh:mm a") : "Pending"}</span></div>
        <div>Hours: <span className="text-slate-200 font-medium">{row.hoursWorked != null ? `${Number(row.hoursWorked).toFixed(1)}h` : "—"}</span></div>
        <div className="text-right">Overtime: <span className="text-slate-200 font-medium">{formatMinutes(computeOvertimeMinutes(row))}</span></div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-slate-800">
        <Badge variant={APPROVAL_VARIANT[row.approvalStatus] || "gray"} className="!py-0.5">
          {formatStatusLabel(row.approvalStatus || "approved")}
        </Badge>
        {renderActions(row)}
      </div>
    </div>
  );

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-[1600px] mx-auto w-full">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-bold text-white tracking-tight">Attendance Records</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
              <Building2 size={12} className="text-blue-400" />
              {companyName}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Tracking {data?.total ?? 0} enterprise log entries
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            onClick={handleExport} disabled={exporting}
          >
            <Download size={14} className="text-slate-400" />
            {exporting ? "Exporting..." : "Export"}
          </button>

          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors cursor-pointer">
            <Upload size={14} className="text-slate-400" />
            {importing ? "Importing..." : "Import"}
            <input type="file" accept=".csv" hidden onChange={handleImportFile} disabled={importing} />
          </label>

          <button
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-950 transition-colors"
            onClick={() => setCheckInModal(true)}
          >
            <Plus size={15} /> Log Attendance
          </button>
        </div>
      </div>

      {/* ── Metric Summary Cards ── */}
      <AttendanceStatCards records={statsRecords} loading={statsLoading} />

      {/* ── Unified Filter & Search Bar — only for privileged roles ── */}
      {isPrivileged && (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex-1">
            <FilterBar
              searchPlaceholder="Search employee name or email..."
              filters={[
                { 
                  key: "status", 
                  label: "Status", 
                  options: ATTENDANCE_STATUS_OPTIONS 
                },
                { 
                  key: "department", 
                  label: "Department", 
                  options: departments.map((d) => ({ label: d, value: d })) 
                },
                {
                  key: "shiftId", 
                  label: "Shift",
                  options: shifts.map((s) => ({ label: s.name, value: s.id })),
                },
                { 
                  key: "approvalStatus", 
                  label: "Approval", 
                  options: APPROVAL_STATUS_OPTIONS 
                },
              ]}
              values={params}
              onChange={handleFilterChange}
              resultCount={data?.total}
            />
          </div>
        </div>

        {/* Date Range Selector Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-slate-800/60 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <CalendarIcon size={14} className="text-slate-500" />
              <span>Date Range:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                value={params.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              />
              <span>to</span>
              <input
                type="date"
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                value={params.dateTo}
                min={params.dateFrom || undefined}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              />
            </div>
          </div>

          <button
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-400 transition-colors"
            onClick={resetFilters}
          >
            <RotateCcw size={13} /> Reset Filters
          </button>
        </div>
      </div>
      )} {/* end isPrivileged filter bar */}

      {/* ── Holiday Banner ── */}
      {selectedHoliday && (
        <div className="flex items-center gap-2.5 rounded-xl border border-blue-800/40 bg-blue-500/10 px-4 py-2.5 text-xs text-blue-300">
          <CalendarHeart size={16} className="shrink-0" />
          <span>
            <strong className="font-semibold">{formatDate(params.dateFrom)}</strong> is a company holiday
            — <strong className="font-semibold">{selectedHoliday.name}</strong>. Employees without another
            record for this date will be auto-marked <strong className="font-semibold">Holiday</strong> rather
            than Absent.
          </span>
        </div>
      )}

      {/* ── Attendance Log Table ── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={data?.attendance || []}
          total={data?.total || 0}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          error={error}
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          onRetry={refetch}
          actions={renderActions}
          mobileCard={mobileCard}
          emptyTitle="No attendance records found"
          emptyDescription="Try adjusting your filter options or date parameters above."
        />
      </div>

      {/* ── Log Attendance Modal ── */}
      <FormModal
        open={checkInModal}
        onClose={() => { setCheckInModal(false); resetCI(); }}
        title="Log Employee Attendance"
        onSubmit={hCI((d) => {
          checkInMutation.mutate({
            employeeId: d.employee,
            date: d.date,
            status: d.status,
            shiftId: d.shiftId || undefined,
            breakMinutes: d.breakMinutes ? Number(d.breakMinutes) : undefined,
            notes: d.notes,
            ...(d.checkIn ? { checkIn: new Date(`${d.date}T${d.checkIn}`) } : {}),
            ...(d.checkOut ? { checkOut: new Date(`${d.date}T${d.checkOut}`) } : {}),
          });
        })}
        loading={checkInMutation.isPending}
        submitLabel="Log Attendance"
      >
        <div className="flex flex-col gap-4 text-xs">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
            <Building2 size={14} className="text-blue-400" />
            <span>Logging for <strong className="text-slate-200">{companyName}</strong></span>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Employee *</label>
            <select className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("employee", { required: true })}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} — {e.department}
                </option>
              ))}
            </select>
            {errCI.employee && <p className="text-[11px] text-rose-400">Employee field is required</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Date *</label>
              <input type="date" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("date", { required: true })} />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Status *</label>
              <select className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("status")}>
                {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Shift</label>
              <select className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("shiftId")}>
                <option value="">— Default / No Shift —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime?.slice(0, 5)} – {s.endTime?.slice(0, 5)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Break (Minutes)</label>
              <input type="number" min="0" placeholder="0" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("breakMinutes")} />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Check In Time</label>
              <input type="time" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("checkIn")} />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Check Out Time</label>
              <input type="time" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCI("checkOut")} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Notes</label>
            <textarea className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" rows={2} placeholder="Optional operational notes..." {...regCI("notes")} />
          </div>
        </div>
      </FormModal>

      {/* ── Edit Record Modal ── */}
      <FormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        title="Edit Attendance Record"
        onSubmit={hEdit((d) =>
          updateMutation.mutate({
            id: editRecord.id,
            data: { ...d, breakMinutes: d.breakMinutes ? Number(d.breakMinutes) : null },
          })
        )}
        loading={updateMutation.isPending}
        submitLabel="Save Changes"
      >
        <div className="flex flex-col gap-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Status</label>
              <select className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regEdit("status")}>
                {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Approval Status</label>
              <select className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regEdit("approvalStatus")}>
                {APPROVAL_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Shift</label>
              <select className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regEdit("shiftId")}>
                <option value="">— Default / No Shift —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime?.slice(0, 5)} – {s.endTime?.slice(0, 5)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Break (Minutes)</label>
              <input type="number" min="0" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regEdit("breakMinutes")} />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Check In</label>
              <input type="datetime-local" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regEdit("checkIn")} />
            </div>

            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Check Out</label>
              <input type="datetime-local" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regEdit("checkOut")} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Notes</label>
            <textarea className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" rows={2} {...regEdit("notes")} />
          </div>
        </div>
      </FormModal>

      {/* ── Details Modal ── */}
      <Modal open={!!detailsRecord} onClose={() => setDetailsRecord(null)} title="Attendance Details" size="md">
        {detailsRecord && (
          <div className="flex flex-col gap-4 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
              <Avatar
                src={detailsRecord.employee?.avatar}
                name={detailsRecord.employee ? `${detailsRecord.employee.firstName} ${detailsRecord.employee.lastName}` : "—"}
                size="md"
              />
              <div>
                <p className="text-sm font-semibold text-slate-200">
                  {detailsRecord.employee ? `${detailsRecord.employee.firstName} ${detailsRecord.employee.lastName}` : "—"}
                </p>
                <p className="text-slate-400">
                  {detailsRecord.employee?.department || "—"} · {detailsRecord.shift?.name || "Default Shift"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4 bg-slate-950/50 p-3 rounded-lg border border-slate-800">
              <DetailField label="Date" value={formatDate(detailsRecord.date)} />
              <DetailField label="Status" value={<Badge variant={classifyStatus(detailsRecord.status)} dot>{formatStatusLabel(detailsRecord.status)}</Badge>} />
              <DetailField label="Check In" value={detailsRecord.checkIn ? format(new Date(detailsRecord.checkIn), "hh:mm a") : "—"} />
              <DetailField label="Check Out" value={detailsRecord.checkOut ? format(new Date(detailsRecord.checkOut), "hh:mm a") : "Pending"} />
              <DetailField label="Working Hours" value={detailsRecord.hoursWorked != null ? `${Number(detailsRecord.hoursWorked).toFixed(1)}h` : "—"} />
              <DetailField label="Break Time" value={formatMinutes(detailsRecord.breakMinutes)} />
              <DetailField label="Overtime" value={formatMinutes(computeOvertimeMinutes(detailsRecord))} />
              <DetailField label="Late" value={formatMinutes(computeLateMinutes(detailsRecord))} />
              <DetailField label="Early Exit" value={formatMinutes(computeEarlyExitMinutes(detailsRecord))} />
              <DetailField label="Approval" value={<Badge variant={APPROVAL_VARIANT[detailsRecord.approvalStatus] || "gray"}>{formatStatusLabel(detailsRecord.approvalStatus || "approved")}</Badge>} />
            </div>

            {detailsRecord.notes && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Notes</p>
                <p className="text-slate-300 p-2 rounded-lg bg-slate-950 border border-slate-800">{detailsRecord.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Correction Request Modal ── */}
      <FormModal
        open={correctionModal}
        onClose={() => setCorrectionModal(false)}
        title="Request Attendance Correction"
        onSubmit={hCorrection((d) =>
          updateMutation.mutate({
            id: correctionRecord.id,
            data: {
              checkIn: d.checkIn || undefined,
              checkOut: d.checkOut || undefined,
              approvalStatus: "pending",
              notes: `Correction requested: ${d.reason}`,
            },
          })
        )}
        loading={updateMutation.isPending}
        submitLabel="Submit Correction"
      >
        <div className="flex flex-col gap-3 text-xs">
          <p className="text-slate-400">
            Submitting a correction resets this entry's approval state to <strong className="text-amber-400">Pending</strong> for management review.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Corrected Check In</label>
              <input type="datetime-local" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCorrection("checkIn")} />
            </div>
            <div className="space-y-1">
              <label className="font-semibold text-slate-300">Corrected Check Out</label>
              <input type="datetime-local" className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" {...regCorrection("checkOut")} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-slate-300">Reason *</label>
            <textarea
              className="w-full rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-blue-500 focus:outline-none" rows={3}
              placeholder="Explain why this record requires adjustment..."
              {...regCorrection("reason", { required: true })}
            />
          </div>
        </div>
      </FormModal>
    </div>
  );
}

function DetailField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-0.5">
        {label}
      </p>
      <div className="text-slate-200 font-medium">{value}</div>
    </div>
  );
}