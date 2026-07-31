import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  Building2,
  Check,
  X as XIcon,
  Ban,
  Pencil,
  Clock,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";

import { leavesAPI } from "@/api/leaves.api";
import { formatDate } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import usePermission from "@/hooks/usePermission";

const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "gray",
};

const TYPE_VARIANT = {
  Annual: "info",
  Sick: "warning",
  Casual: "success",
  Maternity: "purple",
  Paternity: "blue",
  Unpaid: "gray",
  Emergency: "danger",
};

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <div className="text-[14px]" style={{ color: "var(--text-primary)" }}>
        {children}
      </div>
    </div>
  );
}

export default function LeaveDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermission();
  const canApprove = hasPermission("leave.approve");
  const canEditRoute = hasPermission("leave.update") || canApprove;

  const { data: leave, isLoading, error } = useQuery({
    queryKey: ["leave", id],
    queryFn: () => leavesAPI.getById(id).then((r) => r.data),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["leave", id] });
    queryClient.invalidateQueries({ queryKey: ["leaves"] });
  };

  const approveMutation = useMutation({
    mutationFn: (action) =>
      action === "approved" ? leavesAPI.approve(id, "") : leavesAPI.reject(id, ""),
    onSuccess: (_res, action) => {
      invalidate();
      toast.success(action === "approved" ? "Leave approved" : "Leave rejected");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update status"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => leavesAPI.cancel(id),
    onSuccess: () => {
      invalidate();
      toast.success("Leave request cancelled");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to cancel leave"),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card h-64 animate-pulse" style={{ background: "var(--surface-2)" }} />
      </div>
    );
  }

  if (error || !leave) {
    return (
      <div className="p-6 max-w-3xl mx-auto text-center">
        <div className="card p-8">
          <p className="text-[14px]" style={{ color: "var(--text-primary)" }}>
            {error?.response?.data?.message || "Leave request not found"}
          </p>
          <button className="btn btn-secondary mt-4" onClick={() => navigate("/hr/leaves")}>
            Back to Leave Requests
          </button>
        </div>
      </div>
    );
  }

  const employee = leave.employee;
  const status = leave.status || "pending";
  const canCancel = status === "pending" || status === "approved";

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
            Leave Request
          </h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Submitted {formatDate(leave.createdAt)}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[status] || "gray"} dot>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      <div className="card p-5 sm:p-6 flex flex-col gap-6">
        {/* Employee */}
        <div className="flex items-center gap-3 pb-5 border-b" style={{ borderColor: "var(--border)" }}>
          <Avatar
            src={employee?.avatar}
            name={employee ? `${employee.firstName} ${employee.lastName}` : "—"}
            size="md"
          />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {employee ? `${employee.firstName} ${employee.lastName}` : "Unknown employee"}
            </p>
            <p className="text-[12px] truncate flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Building2 size={11} /> {employee?.department || "—"}
            </p>
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          <Field label="Leave Type">
            <Badge variant={TYPE_VARIANT[leave.leaveType] || "info"}>{leave.leaveType || "—"}</Badge>
          </Field>
          <Field label="Duration">
            <span className="font-semibold">{leave.days ?? "—"}</span> day{leave.days === 1 ? "" : "s"}
          </Field>
          <Field label="Status">
            <Badge variant={STATUS_VARIANT[status] || "gray"} dot>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Badge>
          </Field>
          <Field label="Start Date">
            <span className="flex items-center gap-1.5">
              <Calendar size={13} style={{ color: "var(--text-muted)" }} /> {formatDate(leave.startDate)}
            </span>
          </Field>
          <Field label="End Date">
            <span className="flex items-center gap-1.5">
              <Calendar size={13} style={{ color: "var(--text-muted)" }} /> {formatDate(leave.endDate)}
            </span>
          </Field>
        </div>

        {/* Reason */}
        <Field label="Reason">
          <p className="flex items-start gap-2 whitespace-pre-wrap">
            <FileText size={14} className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            {leave.reason || "No reason provided."}
          </p>
        </Field>

        {/* Approval info — only once a decision has actually been made */}
        {(status === "approved" || status === "rejected") && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[12px]"
            style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
          >
            <Clock size={13} className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
            <span>
              {status === "approved" ? "Approved" : "Rejected"} by{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {leave.approvedBy?.name || "—"}
              </strong>
              {leave.approvedAt && <> on {formatDate(leave.approvedAt)}</>}
              {leave.remarks && (
                <>
                  {" — "}
                  <span style={{ color: "var(--text-muted)" }}>{leave.remarks}</span>
                </>
              )}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
          {status === "pending" && canApprove && (
            <>
              <button
                className="btn btn-sm btn-ghost flex items-center gap-1"
                style={{ color: "var(--success)" }}
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate("approved")}
              >
                <Check size={13} /> Approve
              </button>
              <button
                className="btn btn-sm btn-ghost flex items-center gap-1"
                style={{ color: "var(--danger)" }}
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate("rejected")}
              >
                <XIcon size={13} /> Reject
              </button>
            </>
          )}

          {canCancel && (
            <button
              className="btn btn-sm btn-ghost flex items-center gap-1"
              style={{ color: "var(--text-muted)" }}
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (window.confirm("Cancel this leave request?")) cancelMutation.mutate();
              }}
            >
              <Ban size={13} /> Cancel
            </button>
          )}

          {status !== "approved" && canEditRoute && (
            <button
              className="btn btn-sm btn-secondary flex items-center gap-1"
              onClick={() => navigate(`/hr/leaves/${id}/edit`)}
            >
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}