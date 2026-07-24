import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Plus, Check, X as XIcon, Ban, Calendar, Building2 } from "lucide-react";
import { leavesAPI } from "@/api/leaves.api";
import { employeesAPI } from "@/api/employees.api";
import { useAuthStore } from "@/store/auth.store";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import FormModal from "@/components/shared/FormModal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

const leaveSchema = z
  .object({
    employeeId: z.string().min(1, "Employee is required"),
    leaveType: z.string().min(1, "Leave type is required"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    reason: z.string().min(5, "Please provide a reason (min 5 chars)"),
  })
  .refine(
    (d) => !d.startDate || !d.endDate || new Date(d.endDate) >= new Date(d.startDate),
    { message: "End date can't be before the start date", path: ["endDate"] }
  );

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Maternity", "Paternity", "Unpaid", "Emergency"];

const LEAVE_STATUS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "gray",
};

// Leave type color map for visual variety
const TYPE_VARIANT = {
  Annual: "info",
  Sick: "warning",
  Casual: "success",
  Maternity: "purple",
  Paternity: "blue",
  Unpaid: "gray",
  Emergency: "danger",
};

function calcDays(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
}

export default function LeaveRequests() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ── Company name ────────────────────────────────────────────────────────
  const { user, activeCompany, companies } = useAuthStore();
  const companyName =
    (Array.isArray(companies) && companies.find((c) => c.id === activeCompany)?.name) ||
    user?.companyName ||
    "Your Company";

  const [params, setParams] = useState({ page: 1, limit: 20, search: "", status: "", leaveType: "" });
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingRowId, setPendingRowId] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["leaves", params],
    queryFn: () => leavesAPI.getAll(params).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const { data: empData } = useQuery({
    queryKey: ["employees-all"],
    queryFn: () => employeesAPI.getAll({ limit: 200 }).then((r) => r.data),
  });
  const employees = empData?.employees || [];

  const {
    register, handleSubmit, reset, watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(leaveSchema),
    defaultValues: { employeeId: "", leaveType: "", startDate: "", endDate: "", reason: "" },
  });

  const watchStart = watch("startDate");
  const watchEnd = watch("endDate");
  const previewDays = calcDays(watchStart, watchEnd);

  const createMutation = useMutation({
    mutationFn: (d) => {
      const days = calcDays(d.startDate, d.endDate) ?? 1;
      return leavesAPI.create({ ...d, days });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      setModalOpen(false);
      reset();
      toast.success("Leave request submitted");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to submit leave"),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action }) =>
      action === "approved" ? leavesAPI.approve(id, "") : leavesAPI.reject(id, ""),
    onMutate: ({ id }) => setPendingRowId(id),
    onSuccess: (_res, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success(action === "approved" ? "Leave approved" : "Leave rejected");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update status"),
    onSettled: () => setPendingRowId(null),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => leavesAPI.cancel(id),
    onMutate: (id) => setPendingRowId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leaves"] });
      toast.success("Leave request cancelled");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to cancel leave"),
    onSettled: () => setPendingRowId(null),
  });

  // ── Summary KPIs ───────────────────────────────────────────────────────
  const leaves = data?.leaves || [];
  const total = data?.total || 0;
  const pendingCount = leaves.filter((l) => l.status === "pending").length;
  const approvedCount = leaves.filter((l) => l.status === "approved").length;

  const renderActions = (row) => {
    const busy = pendingRowId === row.id;
    return (
      <div className="flex items-center justify-end gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => navigate(`/hr/leaves/${row.id}/edit`)}
          disabled={busy}
        >
          Edit
        </button>
        {row.status === "pending" && (
          <>
            <button
              className="btn btn-sm btn-ghost flex items-center gap-1"
              style={{ color: "var(--success)" }}
              onClick={() => approveMutation.mutate({ id: row.id, action: "approved" })}
              disabled={busy}
            >
              <Check size={13} /> Approve
            </button>
            <button
              className="btn btn-sm btn-ghost flex items-center gap-1"
              style={{ color: "var(--danger)" }}
              onClick={() => approveMutation.mutate({ id: row.id, action: "rejected" })}
              disabled={busy}
            >
              <XIcon size={13} /> Reject
            </button>
          </>
        )}
        {(row.status === "pending" || row.status === "approved") && (
          <button
            className="btn btn-sm btn-ghost flex items-center gap-1"
            style={{ color: "var(--text-muted)" }}
            onClick={() => { if (window.confirm("Cancel this leave request?")) cancelMutation.mutate(row.id); }}
            disabled={busy}
          >
            <Ban size={13} /> Cancel
          </button>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: "employee", label: "Employee",
      render: (val) =>
        val ? (
          <div className="flex items-center gap-2">
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
      key: "leaveType", label: "Type",
      render: (val) => <Badge variant={TYPE_VARIANT[val] || "info"}>{val || "—"}</Badge>,
    },
    { key: "startDate", label: "Start", sortable: true, render: (val) => formatDate(val) },
    { key: "endDate", label: "End", render: (val) => formatDate(val) },
    {
      key: "days", label: "Days",
      render: (val) => <span className="font-semibold">{val ?? "—"}</span>,
    },
    {
      key: "status", label: "Status",
      render: (val = "pending") => (
        <Badge variant={STATUS_VARIANT[val] || "gray"} dot>
          {val.charAt(0).toUpperCase() + val.slice(1)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      {/* ── Header ── */}
      <div className="page-header flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h1 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>
              Leave Requests
            </h1>
            {/* Company name */}
            <span
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              <Building2 size={11} />
              {companyName}
            </span>
          </div>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {total} request{total === 1 ? "" : "s"}
          </p>
        </div>
        <button
          className="btn btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
          onClick={() => setModalOpen(true)}
        >
          <Plus size={14} /> Request Leave
        </button>
      </div>

      {/* ── KPI Bar ── */}
      <div className="mx-4 sm:mx-6 mt-1 mb-4 grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: total, color: "var(--primary)" },
          { label: "Pending", value: pendingCount, color: "#f59e0b" },
          { label: "Approved", value: approvedCount, color: "#22c55e" },
        ].map((k) => (
          <div key={k.label} className="card px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{k.label}</p>
            <p className="text-[22px] font-bold" style={{ color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      <FilterBar
        searchPlaceholder="Search employee..."
        filters={[
          { key: "status", label: "Status", options: LEAVE_STATUS },
          { key: "leaveType", label: "Type", options: LEAVE_TYPES.map((t) => ({ label: t, value: t })) },
        ]}
        values={params}
        onChange={(k, v) => setParams((p) => ({ ...p, [k]: v, page: 1 }))}
      />

      {/* ── Table (desktop) ── */}
      <div className="mx-4 sm:mx-6 mb-6 card overflow-hidden hidden sm:block">
        <DataTable
          columns={columns}
          data={leaves}
          total={total}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          error={error}
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          onRowClick={(row) => navigate(`/hr/leaves/${row.id}/edit`)}
          actions={renderActions}
          emptyTitle="No leave requests"
          emptyDescription="Leave requests from employees will appear here"
        />
      </div>

      {/* ── Cards (mobile) ── */}
      <div className="mx-4 mb-6 space-y-3 sm:hidden">
        {isLoading ? (
          <div className="card flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }} />
          </div>
        ) : error ? (
          <div className="card text-center py-16 px-4" style={{ color: "var(--danger)" }}>
            <p className="text-[13px]">Failed to load data. Please try again.</p>
          </div>
        ) : leaves.length === 0 ? (
          <div className="card flex flex-col items-center justify-center text-center py-14 px-6">
            <Calendar size={26} style={{ color: "var(--text-muted)" }} className="mb-3" />
            <p className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>No leave requests</p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>Leave requests from employees will appear here</p>
          </div>
        ) : (
          leaves.map((row) => (
            <div key={row.id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar src={row.employee?.avatar} name={row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"} size="sm" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—"}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{row.employee?.department || "—"}</p>
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[row.status] || "gray"} dot>
                  {(row.status || "pending").replace(/^\w/, (c) => c.toUpperCase())}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                <span><Badge variant={TYPE_VARIANT[row.leaveType] || "info"} className="!py-0">{row.leaveType || "—"}</Badge></span>
                <span className="text-right font-medium">{row.days ?? "—"} day{row.days === 1 ? "" : "s"}</span>
                <span className="col-span-2">{formatDate(row.startDate)} — {formatDate(row.endDate)}</span>
              </div>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                {renderActions(row)}
              </div>
            </div>
          ))
        )}
        {total > params.limit && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button className="btn btn-sm btn-secondary" disabled={params.page <= 1} onClick={() => setParams((p) => ({ ...p, page: p.page - 1 }))}>Previous</button>
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Page {params.page} of {Math.ceil(total / params.limit)}</span>
            <button className="btn btn-sm btn-secondary" disabled={params.page >= Math.ceil(total / params.limit)} onClick={() => setParams((p) => ({ ...p, page: p.page + 1 }))}>Next</button>
          </div>
        )}
      </div>

      {/* ── Request Leave Modal ── */}
      <FormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); reset(); }}
        title="Request Leave"
        onSubmit={handleSubmit((d) => createMutation.mutate(d))}
        loading={createMutation.isPending}
        submitLabel="Submit Request"
      >
        <div className="flex flex-col gap-4">
          {/* Company context */}
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            <Building2 size={13} />
            <span>Submitting leave for <strong style={{ color: "var(--text-primary)" }}>{companyName}</strong></span>
          </div>

          <div className="form-group">
            <label className="form-label">Employee *</label>
            <select className="input" {...register("employeeId")}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} — {e.department}
                </option>
              ))}
            </select>
            {errors.employeeId && <p className="text-[11px] text-red-500 mt-1">{errors.employeeId.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">Leave Type *</label>
            <select className="input" {...register("leaveType")}>
              <option value="">Select type</option>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.leaveType && <p className="text-[11px] text-red-500 mt-1">{errors.leaveType.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input className="input" type="date" {...register("startDate")} />
              {errors.startDate && <p className="text-[11px] text-red-500 mt-1">{errors.startDate.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input className="input" type="date" min={watchStart || undefined} {...register("endDate")} />
              {errors.endDate && <p className="text-[11px] text-red-500 mt-1">{errors.endDate.message}</p>}
            </div>
          </div>

          {/* Live days preview */}
          {previewDays !== null && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
              style={{ background: "rgba(99,102,241,0.08)", color: "var(--primary, #6366f1)" }}
            >
              <Calendar size={13} />
              <span>
                This request covers <strong>{previewDays}</strong> day{previewDays === 1 ? "" : "s"}
                {previewDays > 5 && <span className="ml-1" style={{ color: "var(--text-muted)" }}>(over a week)</span>}
              </span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Reason *</label>
            <textarea className="input" rows={3} placeholder="Why are you requesting leave?" {...register("reason")} />
            {errors.reason && <p className="text-[11px] text-red-500 mt-1">{errors.reason.message}</p>}
          </div>
        </div>
      </FormModal>
    </div>
  );
}