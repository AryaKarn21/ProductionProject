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
} from "lucide-react";
import { attendanceAPI } from "@/api/attendance.api";
import { employeesAPI } from "@/api/employees.api";
import { shiftsAPI } from "@/api/shifts.api";
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

  // ── Company name ──────────────────────────────────────────────────────────
  const { user, activeCompany, companies } = useAuthStore();
  const companyName =
    (Array.isArray(companies) && companies.find((c) => c.id === activeCompany)?.name) ||
    user?.companyName ||
    "Your Company";

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
  });
  const employees = empData?.employees || [];
  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))],
    [employees]
  );

  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => shiftsAPI.getAll().then((r) => r.data),
  });
  const shifts = shiftData || [];

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
      toast.success("Attendance logged");
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || "Failed to log attendance"),
  });

  const checkOutMutation = useMutation({
    mutationFn: (id) => attendanceAPI.checkOut(id),
    onMutate: (id) => setPendingRowId(id),
    onSuccess: () => { invalidateAll(); toast.success("Checked out"); },
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
      <div className="flex items-center justify-end gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {!row.checkOut && (
          <button
            className="btn btn-ghost btn-sm flex items-center gap-1"
            onClick={() => { if (confirm("Mark check-out now?")) checkOutMutation.mutate(row.id); }}
            disabled={busy} title="Check Out"
          >
            <LogOut size={13} /> Out
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setDetailsRecord(row)} title="View">
          <Eye size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(row)} title="Edit">
          <Pencil size={13} />
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => openCorrection(row)} title="Request Correction">
          <History size={13} />
        </button>
        {row.approvalStatus === "pending" && (
          <>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--success)" }}
              onClick={() => approvalMutation.mutate({ id: row.id, approvalStatus: "approved" })}
              disabled={busy} title="Approve"
            >
              <Check size={13} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--danger)" }}
              onClick={() => approvalMutation.mutate({ id: row.id, approvalStatus: "rejected" })}
              disabled={busy} title="Reject"
            >
              <XIcon size={13} />
            </button>
          </>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: "employee", label: "Employee",
      render: (val) =>
        val ? (
          <div className="flex items-center gap-2 min-w-0">
            <Avatar src={val.avatar} name={`${val.firstName} ${val.lastName}`} size="sm" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {val.firstName} {val.lastName}
              </p>
              <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                {val.department || "—"}
              </p>
            </div>
          </div>
        ) : "—",
    },
    {
      key: "department", label: "Department", hideOnMobile: true,
      render: (_val, row) => row.employee?.department || "—",
    },
    { key: "shift", label: "Shift", render: (val) => val?.name || <span style={{ color: "var(--text-muted)" }}>Default</span> },
    { key: "date", label: "Date", sortable: true, render: (val) => formatDate(val) },
    { key: "checkIn", label: "Check In", render: (val) => val ? format(new Date(val), "hh:mm a") : "—" },
    {
      key: "checkOut", label: "Check Out",
      render: (val) => val ? format(new Date(val), "hh:mm a") : <span style={{ color: "var(--text-muted)" }}>Pending</span>,
    },
    {
      key: "hoursWorked", label: "Working Hours",
      render: (val) => val != null ? <span className="font-medium">{Number(val).toFixed(1)}h</span> : "—",
    },
    { key: "breakMinutes", label: "Break", hideOnMobile: true, render: (val) => val != null ? formatMinutes(val) : "—" },
    { key: "overtime", label: "Overtime", render: (_val, row) => formatMinutes(computeOvertimeMinutes(row)) },
    { key: "late", label: "Late", hideOnMobile: true, render: (_val, row) => formatMinutes(computeLateMinutes(row)) },
    { key: "earlyExit", label: "Early Exit", hideOnMobile: true, render: (_val, row) => formatMinutes(computeEarlyExitMinutes(row)) },
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
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar src={row.employee?.avatar} name={row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"} size="sm" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"}
            </p>
            <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
              {row.employee?.department || "—"} · {row.shift?.name || "Default"}
            </p>
          </div>
        </div>
        <Badge variant={classifyStatus(row.status)} dot>{formatStatusLabel(row.status)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <span>In: {row.checkIn ? format(new Date(row.checkIn), "hh:mm a") : "—"}</span>
        <span className="text-right">Out: {row.checkOut ? format(new Date(row.checkOut), "hh:mm a") : "Pending"}</span>
        <span>Hours: {row.hoursWorked != null ? `${Number(row.hoursWorked).toFixed(1)}h` : "—"}</span>
        <span className="text-right">OT: {formatMinutes(computeOvertimeMinutes(row))}</span>
        <span className="col-span-2">
          <Badge variant={APPROVAL_VARIANT[row.approvalStatus] || "gray"} className="!py-0">
            {formatStatusLabel(row.approvalStatus || "approved")}
          </Badge>
        </span>
      </div>
      <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        {renderActions(row)}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in">
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>
              Attendance
            </h1>
            {/* Company name badge */}
            <span
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              <Building2 size={11} />
              {companyName}
            </span>
          </div>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {data?.total ?? 0} records
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <button
            className="btn btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto"
            onClick={handleExport} disabled={exporting}
          >
            <Download size={14} /> {exporting ? "Exporting..." : "Export"}
          </button>
          <label className="btn btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto cursor-pointer">
            <Upload size={14} /> {importing ? "Importing..." : "Import"}
            <input type="file" accept=".csv" hidden onChange={handleImportFile} disabled={importing} />
          </label>
          <button
            className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            onClick={() => setCheckInModal(true)}
          >
            <Plus size={14} /> Log Attendance
          </button>
        </div>
      </div>

      <AttendanceStatCards records={statsRecords} loading={statsLoading} />

      <div className="mt-4">
        <FilterBar
          searchPlaceholder="Search employee..."
          filters={[
            { key: "status", label: "Status", options: ATTENDANCE_STATUS_OPTIONS },
            { key: "department", label: "Department", options: departments.map((d) => ({ label: d, value: d })) },
            {
              key: "shiftId", label: "Shift",
              options: shifts.map((s) => ({ label: s.name, value: s.id })),
            },
            { key: "approvalStatus", label: "Approval", options: APPROVAL_STATUS_OPTIONS },
          ]}
          values={params}
          onChange={handleFilterChange}
          resultCount={data?.total}
        />
      </div>

      <div className="mx-4 sm:mx-6 mt-3 mb-4 card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 flex-1">
          <div className="flex items-center gap-2 flex-1">
            <label className="form-label mb-0 whitespace-nowrap">From</label>
            <input
              type="date" className="input w-full xs:w-auto"
              value={params.dateFrom}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <label className="form-label mb-0 whitespace-nowrap">To</label>
            <input
              type="date" className="input w-full xs:w-auto"
              value={params.dateTo}
              min={params.dateFrom || undefined}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
            />
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm flex items-center justify-center gap-1.5 w-full sm:w-auto shrink-0"
          style={{ color: "var(--primary)" }}
          onClick={resetFilters}
        >
          <RotateCcw size={13} /> Reset Filters
        </button>
      </div>

      <div className="mx-4 sm:mx-6 mb-6 card overflow-hidden">
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
          emptyTitle="No attendance records"
          emptyDescription="No records found for the selected date range and filters"
        />
      </div>

      {/* ── Log Attendance Modal ── */}
      <FormModal
        open={checkInModal}
        onClose={() => { setCheckInModal(false); resetCI(); }}
        title="Log Attendance"
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
        <div className="flex flex-col gap-4">
          {/* Company context */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            <Building2 size={13} />
            <span>Logging for <strong style={{ color: "var(--text-primary)" }}>{companyName}</strong></span>
          </div>

          <div className="form-group">
            <label className="form-label">Employee *</label>
            <select className="input" {...regCI("employee", { required: true })}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} — {e.department}
                </option>
              ))}
            </select>
            {errCI.employee && <p className="text-[11px] text-red-500">Employee is required</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Date *</label>
              <input type="date" className="input" {...regCI("date", { required: true })} />
            </div>
            <div className="form-group">
              <label className="form-label">Status *</label>
              <select className="input" {...regCI("status")}>
                {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* ── Shift dropdown — shows shifts for this company ── */}
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select className="input" {...regCI("shiftId")}>
                <option value="">— Default / No Shift —</option>
                {shifts.length === 0 && (
                  <option disabled>No shifts found — add one in HR › Shifts</option>
                )}
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime?.slice(0, 5)} – {s.endTime?.slice(0, 5)})
                  </option>
                ))}
              </select>
              {shifts.length === 0 && (
                <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                  No shifts yet. <a href="/hr/shifts" className="underline" style={{ color: "var(--primary)" }}>Create one</a> first.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Break (minutes)</label>
              <input type="number" min="0" className="input" placeholder="0" {...regCI("breakMinutes")} />
            </div>
            <div className="form-group">
              <label className="form-label">Check In Time</label>
              <input type="time" className="input" {...regCI("checkIn")} />
            </div>
            <div className="form-group">
              <label className="form-label">Check Out Time</label>
              <input type="time" className="input" {...regCI("checkOut")} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="input" rows={2} placeholder="Any additional notes..." {...regCI("notes")} />
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
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Attendance Status</label>
              <select className="input" {...regEdit("status")}>
                {ATTENDANCE_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Approval Status</label>
              <select className="input" {...regEdit("approvalStatus")}>
                {APPROVAL_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Shift</label>
              <select className="input" {...regEdit("shiftId")}>
                <option value="">— Default / No Shift —</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.startTime?.slice(0, 5)} – {s.endTime?.slice(0, 5)})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Break (minutes)</label>
              <input type="number" min="0" className="input" {...regEdit("breakMinutes")} />
            </div>
            <div className="form-group">
              <label className="form-label">Check In</label>
              <input type="datetime-local" className="input" {...regEdit("checkIn")} />
            </div>
            <div className="form-group">
              <label className="form-label">Check Out</label>
              <input type="datetime-local" className="input" {...regEdit("checkOut")} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="input" rows={2} {...regEdit("notes")} />
          </div>
        </div>
      </FormModal>

      {/* ── Details Modal ── */}
      <Modal open={!!detailsRecord} onClose={() => setDetailsRecord(null)} title="Attendance Details" size="md">
        {detailsRecord && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar
                src={detailsRecord.employee?.avatar}
                name={detailsRecord.employee ? `${detailsRecord.employee.firstName} ${detailsRecord.employee.lastName}` : "—"}
                size="md"
              />
              <div>
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {detailsRecord.employee ? `${detailsRecord.employee.firstName} ${detailsRecord.employee.lastName}` : "—"}
                </p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {detailsRecord.employee?.department || "—"} · {detailsRecord.shift?.name || "Default"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-[13px]">
              <DetailField label="Date" value={formatDate(detailsRecord.date)} />
              <DetailField label="Status" value={<Badge variant={classifyStatus(detailsRecord.status)} dot>{formatStatusLabel(detailsRecord.status)}</Badge>} />
              <DetailField label="Check In" value={detailsRecord.checkIn ? format(new Date(detailsRecord.checkIn), "hh:mm a") : "—"} />
              <DetailField label="Check Out" value={detailsRecord.checkOut ? format(new Date(detailsRecord.checkOut), "hh:mm a") : "Pending"} />
              <DetailField label="Working Hours" value={detailsRecord.hoursWorked != null ? `${Number(detailsRecord.hoursWorked).toFixed(1)}h` : "—"} />
              <DetailField label="Break" value={formatMinutes(detailsRecord.breakMinutes)} />
              <DetailField label="Overtime" value={formatMinutes(computeOvertimeMinutes(detailsRecord))} />
              <DetailField label="Late" value={formatMinutes(computeLateMinutes(detailsRecord))} />
              <DetailField label="Early Exit" value={formatMinutes(computeEarlyExitMinutes(detailsRecord))} />
              <DetailField label="Approval" value={<Badge variant={APPROVAL_VARIANT[detailsRecord.approvalStatus] || "gray"}>{formatStatusLabel(detailsRecord.approvalStatus || "approved")}</Badge>} />
            </div>
            {detailsRecord.notes && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Notes</p>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{detailsRecord.notes}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Correction Modal ── */}
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
        <div className="flex flex-col gap-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Submitting a correction sets this record's approval status back to <strong>Pending</strong> for manager review.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Corrected Check In</label>
              <input type="datetime-local" className="input" {...regCorrection("checkIn")} />
            </div>
            <div className="form-group">
              <label className="form-label">Corrected Check Out</label>
              <input type="datetime-local" className="input" {...regCorrection("checkOut")} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reason *</label>
            <textarea
              className="input" rows={3}
              placeholder="Explain why this record needs correction..."
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
      <p className="text-[10px] font-medium uppercase tracking-wide mb-0.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div style={{ color: "var(--text-primary)" }}>{value}</div>
    </div>
  );
}