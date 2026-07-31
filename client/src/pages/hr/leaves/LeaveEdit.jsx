import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import { leavesAPI } from "@/api/leaves.api";
import { employeesAPI } from "@/api/employees.api";
import { useAuthStore } from "@/store/auth.store";

const LEAVE_TYPES = [
  "Annual",
  "Sick",
  "Casual",
  "Maternity",
  "Paternity",
  "Unpaid",
  "Emergency",
];

const LEAVE_STATUS = [
  "Pending",
  "Approved",
  "Rejected",
  "Cancelled",
];

export default function LeaveEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isEmployee = user?.role === "employee";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  // Load Leave
  const { data: leave, isLoading } = useQuery({
    queryKey: ["leave", id],
    queryFn: () => leavesAPI.getById(id).then((res) => res.data),
  });

  // Load Employees
  const { data: employeeData } = useQuery({
    queryKey: ["employees"],
    queryFn: () => employeesAPI.getAll({ limit: 200 }).then((res) => res.data),
  });

  const employees = employeeData?.employees || [];

  useEffect(() => {
    if (!leave) return;

    reset({
      employeeId: leave.employeeId || "",
      leaveType: leave.leaveType || "",
      startDate: leave.startDate
        ? leave.startDate.slice(0, 10)
        : "",
      endDate: leave.endDate
        ? leave.endDate.slice(0, 10)
        : "",
      reason: leave.reason || "",
      status: leave.status || "Pending",
    });
  }, [leave, reset]);

  const updateMutation = useMutation({
    mutationFn: (data) => {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);

      const days =
        Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

      return leavesAPI.update(id, {
        ...data,
        days,
      });
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["leave", id],
      });

      queryClient.invalidateQueries({
        queryKey: ["leaves"],
      });

      toast.success("Leave updated successfully");

      navigate("/hr/leaves");
    },

    onError: (err) => {
      toast.error(
        err?.response?.data?.message ||
          "Failed to update leave"
      );
    },
  });

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto animate-fade-in">

      <div className="flex items-center gap-3 mb-6">
        <button
          className="btn btn-secondary"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} />
        </button>

        <h1 className="text-xl font-bold">
          Edit Leave Request
        </h1>
      </div>

      <form
        className="card p-6 flex flex-col gap-5"
        onSubmit={handleSubmit((data) =>
          updateMutation.mutate(data)
        )}
      >

        <div className="grid grid-cols-2 gap-4">

          {/* Employee — locked for the Employee role */}
          <div className="form-group">
            <label>Employee *</label>
            {isEmployee ? (
              <div
                className="input flex items-center gap-2 cursor-not-allowed opacity-70"
                style={{ background: "var(--surface-2)" }}
              >
                {/* Show the currently linked employee name */}
                {employees.find(e => String(e.id) === String(leave?.employeeId))
                  ? (() => {
                      const emp = employees.find(e => String(e.id) === String(leave?.employeeId));
                      return <span>{emp.firstName} {emp.lastName}</span>;
                    })()
                  : <span style={{ color: "var(--text-muted)" }}>Loading…</span>
                }
                <input type="hidden" {...register("employeeId", { required: "Employee is required" })} />
              </div>
            ) : (
              <select
                className="input"
                {...register("employeeId", { required: "Employee is required" })}
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            )}
            {errors.employeeId && (
              <p className="text-red-500 text-xs">{errors.employeeId.message}</p>
            )}
          </div>

          <div className="form-group">
            <label>Leave Type *</label>

            <select
              className="input"
              {...register("leaveType", {
                required: "Leave type is required",
              })}
            >
              <option value="">Select Leave Type</option>

              {LEAVE_TYPES.map((type) => (
                <option
                  key={type}
                  value={type}
                >
                  {type}
                </option>
              ))}
            </select>

            {errors.leaveType && (
              <p className="text-red-500 text-xs">
                {errors.leaveType.message}
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Start Date *</label>

            <input
              type="date"
              className="input"
              {...register("startDate", {
                required: "Start date is required",
              })}
            />

            {errors.startDate && (
              <p className="text-red-500 text-xs">
                {errors.startDate.message}
              </p>
            )}
          </div>

          <div className="form-group">
            <label>End Date *</label>

            <input
              type="date"
              className="input"
              {...register("endDate", {
                required: "End date is required",
              })}
            />

            {errors.endDate && (
              <p className="text-red-500 text-xs">
                {errors.endDate.message}
              </p>
            )}
          </div>

          {/* Status — only visible to HR / Admin / Super Admin */}
          {!isEmployee && (
            <div className="form-group col-span-2">
              <label>Status</label>
              <select className="input" {...register("status")}>
                {LEAVE_STATUS.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group col-span-2">
            <label>Reason *</label>

            <textarea
              rows={5}
              className="input"
              {...register("reason", {
                required: "Reason is required",
              })}
            />

            {errors.reason && (
              <p className="text-red-500 text-xs">
                {errors.reason.message}
              </p>
            )}
          </div>

        </div>

        <div className="flex justify-end gap-3">

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate(-1)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending
              ? "Updating..."
              : "Update Leave"}
          </button>

        </div>

      </form>

    </div>
  );
}