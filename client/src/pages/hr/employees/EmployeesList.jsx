import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, UserCheck } from "lucide-react";
import { employeesAPI } from "@/api/employees.api";
import DataTable from "@/components/shared/DataTable";
import FilterBar from "@/components/shared/FilterBar";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { formatDate, formatCurrency, classifyStatus } from "@/lib/utils";
import toast from "react-hot-toast";
import FormModal from "@/components/shared/FormModal";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { employeeSchema } from "@/lib/validations";
import { shiftsAPI } from "@/api/shifts.api";

export default function EmployeesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useState({
    page: 1,
    limit: 20,
    search: "",
    department: "",
    status: "",
    sortKey: "createdAt",
    sortDir: "desc",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["employees", params],
    queryFn: () => employeesAPI.getAll(params).then((r) => r.data),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => shiftsAPI.getAll().then((r) => r.data),
  });
  const shifts = shiftData?.shifts || shiftData || [];

  // Reuse the employee list itself as the "reporting manager" source
  const { data: managerData } = useQuery({
    queryKey: ["employees", "managers"],
    queryFn: () => employeesAPI.getAll({ limit: 100 }).then((r) => r.data),
  });
  const managers = managerData?.employees || managerData?.items || [];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      dateOfBirth: "",
      gender: "",
      maritalStatus: "",
      bloodGroup: "",
      nationality: "",
      citizenshipNumber: "",
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
      emergencyContactName: "",
      emergencyPhone: "",
      workLocation: "",
      status: "active",
      shiftId: "",
      reportingManagerId: "",
      allowances: 0,
      bonus: 0,
      overtime: 0,
      tax: 0,
      pf: 0,
      insurance: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: employeesAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setModalOpen(false);
      reset();
      toast.success("Employee created successfully");
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Failed to create employee");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: employeesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee removed");
    },
  });

  const columns = [
    {
      key: "firstName",
      label: "Employee",
      sortable: true,
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <Avatar
            name={`${row.firstName} ${row.lastName}`}
            size="sm"
            src={row.avatar}
          />
          <div>
            <p
              className="text-[13px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {row.firstName} {row.lastName}
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {row.employeeId || "—"}
            </p>
          </div>
        </div>
      ),
    },
    { key: "designation", label: "Designation", sortable: true },
    { key: "department", label: "Department", sortable: true },
    { key: "email", label: "Email" },
    {
      key: "joinDate",
      label: "Joined",
      sortable: true,
      render: (val) => formatDate(val),
    },
    { key: "salary", label: "Salary", render: (val) => formatCurrency(val) },
    {
      key: "status",
      label: "Status",
      render: (val = "active") => (
        <Badge variant={classifyStatus(val)} dot>
          {val}
        </Badge>
      ),
    },
    {
      key: "id",
      label: "",
      render: (_, row) => (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(`/hr/employees/${row.id}`)}
          >
            View
          </button>

          <button
            className="btn btn-ghost btn-sm text-red-500"
            onClick={() => {
              if (confirm("Remove employee?")) {
                deleteMutation.mutate(row.id);
              }
            }}
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1
            className="text-[18px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Employees
          </h1>
          <p
            className="text-[12px] mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {data?.total ?? 0} total employees
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={14} /> Add Employee
        </button>
      </div>
      <FilterBar
        searchPlaceholder="Search by name, ID, email..."
        filters={[
          {
            key: "department",
            label: "Department",
            options: [
              "Engineering",
              "Sales",
              "HR",
              "Finance",
              "Operations",
              "Marketing",
            ].map((v) => ({ label: v, value: v })),
          },
          {
            key: "status",
            label: "Status",
            options: ["active", "inactive", "on_leave"].map((v) => ({
              label: v,
              value: v,
            })),
          },
        ]}
        values={params}
        onChange={(k, v) => setParams((p) => ({ ...p, [k]: v, page: 1 }))}
      />
      <div className="mx-6 mb-6 card overflow-hidden">
        <DataTable
          columns={columns}
          data={data?.employees || []}
          total={data?.total || 0}
          page={params.page}
          pageSize={params.limit}
          loading={isLoading}
          error={error}
          sortKey={params.sortKey}
          sortDir={params.sortDir}
          onSort={(k, d) =>
            setParams((p) => ({ ...p, sortKey: k, sortDir: d }))
          }
          onPageChange={(page) => setParams((p) => ({ ...p, page }))}
          onRowClick={(row) => navigate(`/hr/employees/${row.id}`)}
          emptyTitle="No employees yet"
          emptyDescription="Add your first employee to get started"
        />
      </div>

      <FormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          reset();
        }}
        title="Add Employee"
        onSubmit={handleSubmit((d) => createMutation.mutate(d))}
        loading={createMutation.isPending}
        submitLabel="Create Employee"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input
                className="input"
                placeholder="John"
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-[11px] text-red-500">
                  {errors.firstName.message}
                </p>
              )}
            </div>
         
         {/* ========== PERSONAL DETAILS ========== */}
          <div className="col-span-2 mt-2 mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Personal Details
          </div>

          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input className="input" type="date" {...register("dateOfBirth")} />
          </div>
          <div className="form-group">
            <label className="form-label">Gender</label>
            <select className="input" {...register("gender")}>
              <option value="">Select</option>
              <option>Male</option><option>Female</option><option>Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Marital Status</label>
            <select className="input" {...register("maritalStatus")}>
              <option value="">Select</option>
              <option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Blood Group</label>
            <input className="input" placeholder="O+" {...register("bloodGroup")} />
          </div>
          <div className="form-group">
            <label className="form-label">Nationality</label>
            <input className="input" placeholder="Nepali" {...register("nationality")} />
          </div>
          <div className="form-group">
            <label className="form-label">Citizenship Number</label>
            <input className="input" {...register("citizenshipNumber")} />
          </div>

          {/* ========== ADDRESS ========== */}
          <div className="col-span-2 mt-2 mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Address
          </div>
          <div className="form-group col-span-2">
            <label className="form-label">Address</label>
            <input className="input" {...register("address")} />
          </div>
          <div className="form-group">
            <label className="form-label">City</label>
            <input className="input" {...register("city")} />
          </div>
          <div className="form-group">
            <label className="form-label">State</label>
            <input className="input" {...register("state")} />
          </div>
          <div className="form-group">
            <label className="form-label">Country</label>
            <input className="input" {...register("country")} />
          </div>
          <div className="form-group">
            <label className="form-label">Postal Code</label>
            <input className="input" {...register("postalCode")} />
          </div>

          {/* ========== EMERGENCY CONTACT ========== */}
          <div className="col-span-2 mt-2 mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Emergency Contact
          </div>
          <div className="form-group">
            <label className="form-label">Contact Name</label>
            <input className="input" {...register("emergencyContactName")} />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Phone</label>
            <input className="input" {...register("emergencyPhone")} />
          </div>

          {/* ========== SHIFT & REPORTING ========== */}
          <div className="col-span-2 mt-2 mb-1 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Shift & Reporting
          </div>
          <div className="form-group">
            <label className="form-label">Shift</label>
            <select className="input" {...register("shiftId")}>
              <option value="">No shift assigned</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.startTime ? `(${s.startTime}–${s.endTime})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Reporting Manager / Admin</label>
            <select className="input" {...register("reportingManagerId")}>
              <option value="">None</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName} — {m.designation}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Work Location</label>
            <input className="input" placeholder="Kathmandu HQ" {...register("workLocation")} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="input" {...register("status")}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>


            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input
                className="input"
                placeholder="Doe"
                {...register("lastName")}
              />
              {errors.lastName && (
                <p className="text-[11px] text-red-500">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input
                className="input"
                type="email"
                placeholder="john@company.com"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[11px] text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input
                className="input"
                placeholder="+977 98XXXXXXXX"
                {...register("phone")}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Department *</label>
              <input
                className="input"
                placeholder="e.g. Engineering"
                {...register("department")}
              />
              {errors.department && (
                <p className="text-[11px] text-red-500">
                  {errors.department.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Designation *</label>
              <input
                className="input"
                placeholder="e.g. Software Engineer"
                {...register("designation")}
              />
              {errors.designation && (
                <p className="text-[11px] text-red-500">
                  {errors.designation.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Join Date *</label>
              <input className="input" type="date" {...register("joinDate")} />
              {errors.joinDate && (
                <p className="text-[11px] text-red-500">
                  {errors.joinDate.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Salary (NPR) *</label>
              <input
                className="input"
                type="number"
                placeholder="0"
                {...register("salary")}
              />
              {errors.salary && (
                <p className="text-[11px] text-red-500">
                  {errors.salary.message}
                </p>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Employee ID</label>
              <hr className="col-span-2 my-3" />

              <div className="col-span-2">
                <h3 className="text-lg font-semibold">
                  Employment Information
                </h3>
              </div>

              <div className="form-group">
                <label className="form-label">Employment Type</label>

                <select className="input" {...register("employmentType")}>
                  <option>Full-Time</option>
                  <option>Part-Time</option>
                  <option>Contract</option>
                  <option>Intern</option>
                  <option>Consultant</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Confirmation Date</label>

                <input
                  type="date"
                  className="input"
                  {...register("confirmationDate")}
                />
              </div>

              {/* Employee ID — auto-assigned by server, shown as read-only preview */}
              <div className="form-group">
                <label className="form-label">Employee ID</label>
                <div className="relative">
                  <input
                    readOnly
                    className="input pr-20 opacity-70 cursor-not-allowed"
                    value={(() => {
                      const list = data?.employees || [];
                      if (!list.length) return "EMP0001";
                      const nums = list
                        .map((e) => {
                          const m = String(e.employeeId || "").match(/^EMP(\d+)$/);
                          return m ? Number(m[1]) : 0;
                        })
                        .filter(Boolean);
                      const next = nums.length ? Math.max(...nums) + 1 : 1;
                      return `EMP${String(next).padStart(4, "0")}`;
                    })()}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    Auto
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Automatically assigned on save. Cannot be changed.</p>
              </div>
            </div>
          </div>
        </div>
      <hr className="col-span-2 my-3" />

<div className="col-span-2">
  <h3 className="text-lg font-semibold">
    Salary Information
  </h3>
</div>

<div className="form-group">
  <label className="form-label">
    Salary Type
  </label>

  <select
    className="input"
    {...register("salaryType")}
  >
    <option>Monthly</option>
    <option>Daily</option>
    <option>Hourly</option>
  </select>
</div>

<div className="form-group">
  <label className="form-label">
    Currency
  </label>

  <input
    className="input"
    {...register("currency")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    Salary Effective Date
  </label>

  <input
    type="date"
    className="input"
    {...register("salaryEffectiveDate")}
  />
</div>

<hr className="col-span-2 my-3" />

<div className="col-span-2">
  <h3 className="text-lg font-semibold">
    Bank Information
  </h3>
</div>

<div className="form-group">
  <label className="form-label">
    Bank Name
  </label>

  <input
    className="input"
    {...register("bankName")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    Account Holder
  </label>

  <input
    className="input"
    {...register("accountHolderName")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    Account Number
  </label>

  <input
    className="input"
    {...register("bankAccountNumber")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    IFSC / SWIFT
  </label>

  <input
    className="input"
    {...register("ifscSwiftCode")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    Payment Method
  </label>

  <select
    className="input"
    {...register("paymentMethod")}
  >
    <option>Bank Transfer</option>
    <option>Cash</option>
    <option>Cheque</option>
    <option>Digital Wallet</option>
  </select>
</div>
<hr className="col-span-2 my-3" />



<div className="col-span-2">
  <h3 className="text-lg font-semibold">
    Government Information
  </h3>
</div>

<div className="form-group">
  <label className="form-label">
    PAN / Tax Number
  </label>

  <input
    className="input"
    {...register("panTaxNumber")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    PF Number
  </label>

  <input
    className="input"
    {...register("pfNumber")}
  />
</div>

<div className="form-group">
  <label className="form-label">
    ESI Number
  </label>

  <input
    className="input"
    {...register("esiNumber")}
  />
</div>

<div className="form-group col-span-2">
  <label className="form-label">
    Salary Notes
  </label>

  <textarea
    rows={3}
    className="input"
    {...register("salaryNotes")}
  />
</div>

      </FormModal>
    </div>
  );
}