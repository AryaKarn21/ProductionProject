import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { employeesAPI } from "@/api/employees.api";
import { shiftsAPI } from "@/api/shifts.api";
import toast from "react-hot-toast";

// ─── reusable field components ───────────────────────────────
function FormField({ label, children, span2 = false }) {
  return (
    <div className={span2 ? "md:col-span-2" : ""}>
      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-slate-50/50 transition-all text-sm font-medium text-slate-800 disabled:opacity-60 disabled:cursor-not-allowed";

const selectCls =
  "w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-slate-50/50 transition-all text-sm font-medium text-slate-800";

function SectionHeading({ title, subtitle }) {
  return (
    <div className="md:col-span-2 pt-2 pb-1 border-t border-slate-100 mt-2">
      <h3 className="text-[13px] font-bold text-slate-700">{title}</h3>
      {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

const ACTIVE_TAB_CLS = "text-sm font-semibold text-blue-600 border-b-2 border-blue-600 pb-3 cursor-pointer whitespace-nowrap";
const IDLE_TAB_CLS  = "text-sm font-medium text-slate-400 border-b-2 border-transparent pb-3 cursor-pointer whitespace-nowrap hover:text-slate-600 transition-colors";

export default function EmployeeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState("details");

  const [formData, setFormData] = useState({
    // Basic
    firstName: "", lastName: "", email: "", phone: "",
    department: "", designation: "",
    shiftId: "",
    employmentType: "Full-Time",
    workLocation: "",
    // Employee ID (read-only, auto-assigned by server)
    employeeId: "",
    // Salary
    salary: "",
    salaryType: "Monthly",
    currency: "NPR",
    allowances: "",
    overtime: "",
    tax: "",
    insurance: "",
    salaryEffectiveDate: "",
    salaryNotes: "",
    // Bank
    bankName: "",
    accountHolderName: "",
    bankAccountNumber: "",
    ifscSwiftCode: "",
    paymentMethod: "Bank Transfer",
    panTaxNumber: "",
    pfNumber: "",
    esiNumber: "",
  });

  // ── Queries ──────────────────────────────────────────────
  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => employeesAPI.getById(id).then((r) => r.data),
  });

  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => shiftsAPI.getAll().then((r) => r.data),
  });
  const shifts = shiftData?.shifts || shiftData || [];

  // ── Seed form when employee loads ────────────────────────
  useEffect(() => {
    if (!employee) return;
    setFormData({
      firstName:          employee.firstName || "",
      lastName:           employee.lastName || "",
      email:              employee.email || "",
      phone:              employee.phone || "",
      department:         employee.department || "",
      designation:        employee.designation || "",
      shiftId:            employee.shiftId || employee.shift?.id || "",
      employmentType:     employee.employmentType || "Full-Time",
      workLocation:       employee.workLocation || "",
      employeeId:         employee.employeeId || "",
      salary:             employee.salary ?? "",
      salaryType:         employee.salaryType || "Monthly",
      currency:           employee.currency || "NPR",
      allowances:         employee.allowances ?? "",
      overtime:           employee.overtime ?? "",
      tax:                employee.tax ?? "",
      insurance:          employee.insurance ?? "",
      salaryEffectiveDate: employee.salaryEffectiveDate || "",
      salaryNotes:        employee.salaryNotes || "",
      bankName:           employee.bankName || "",
      accountHolderName:  employee.accountHolderName || "",
      bankAccountNumber:  employee.bankAccountNumber || "",
      ifscSwiftCode:      employee.ifscSwiftCode || "",
      paymentMethod:      employee.paymentMethod || "Bank Transfer",
      panTaxNumber:       employee.panTaxNumber || "",
      pfNumber:           employee.pfNumber || "",
      esiNumber:          employee.esiNumber || "",
    });
  }, [employee]);

  // ── Mutation ─────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: (data) => employeesAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee updated successfully");
      navigate(`/hr/employees/${id}`);
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Update failed"),
  });

  const set = (field) => (e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    // employeeId is read-only — strip it before sending so the server keeps its value
    const { employeeId: _eid, ...payload } = formData;
    updateMutation.mutate(payload);
  };

  // ── Derived ───────────────────────────────────────────────
  const grossPay =
    (parseFloat(formData.salary) || 0) +
    (parseFloat(formData.allowances) || 0) +
    (parseFloat(formData.overtime) || 0);
  const netPay =
    grossPay -
    (parseFloat(formData.tax) || 0) -
    (parseFloat(formData.insurance) || 0);
  const selectedShift = shifts.find((s) => s.id === formData.shiftId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading employee…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-8 text-slate-800">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>

          <div className="w-12 h-12 rounded-full bg-[#fef3c7] text-[#d97706] font-bold flex items-center justify-center text-lg shadow-sm border border-amber-100 shrink-0">
            {formData.firstName ? formData.firstName.charAt(0).toUpperCase() : "E"}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 break-words">
                {formData.firstName || "Edit"} {formData.lastName || "Employee"}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                active
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-0.5 font-medium truncate">
              {formData.designation || "—"} · {formData.department || "—"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all w-full sm:w-auto"
        >
          Cancel
        </button>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 items-start">

        {/* ── Form Card ── */}
        <form onSubmit={handleSubmit} className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Tab bar */}
          <div className="border-b border-slate-100 px-4 sm:px-6 pt-4 flex gap-6 overflow-x-auto">
            {[
              { key: "details",  label: "Edit Details" },
              { key: "salary",   label: "Salary & Pay" },
              { key: "bank",     label: "Bank Details" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={activeSection === key ? ACTIVE_TAB_CLS : IDLE_TAB_CLS}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-8">

            {/* ═══════════ DETAILS SECTION ═══════════ */}
            {activeSection === "details" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

                {/* Employee ID — read-only, auto-assigned */}
                <FormField label="Employee ID">
                  <div className="relative">
                    <input
                      readOnly
                      className={inputCls + " pr-24"}
                      value={formData.employeeId || "Auto-assigned"}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                      Auto
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Assigned automatically by the system and cannot be changed.</p>
                </FormField>

                <FormField label="Employment Type">
                  <select className={selectCls} value={formData.employmentType} onChange={set("employmentType")}>
                    {["Full-Time", "Part-Time", "Contract", "Intern", "Freelance"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="First Name">
                  <input type="text" className={inputCls} placeholder="e.g. Arya" required value={formData.firstName} onChange={set("firstName")} />
                </FormField>

                <FormField label="Last Name">
                  <input type="text" className={inputCls} placeholder="e.g. Karn" required value={formData.lastName} onChange={set("lastName")} />
                </FormField>

                <FormField label="Email Address">
                  <input type="email" className={inputCls} placeholder="name@company.com" required value={formData.email} onChange={set("email")} />
                </FormField>

                <FormField label="Phone Number">
                  <input type="text" className={inputCls} placeholder="+977 XXXXXXXXXX" value={formData.phone} onChange={set("phone")} />
                </FormField>

                <FormField label="Department">
                  <input type="text" className={inputCls} placeholder="e.g. Engineering" value={formData.department} onChange={set("department")} />
                </FormField>

                <FormField label="Designation">
                  <input type="text" className={inputCls} placeholder="e.g. Software Engineer" value={formData.designation} onChange={set("designation")} />
                </FormField>

                <FormField label="Work Location">
                  <input type="text" className={inputCls} placeholder="e.g. Kathmandu Office" value={formData.workLocation} onChange={set("workLocation")} />
                </FormField>

                <FormField label="Shift">
                  <select className={selectCls} value={formData.shiftId} onChange={set("shiftId")}>
                    <option value="">No shift assigned</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.startTime && s.endTime ? ` (${s.startTime}–${s.endTime})` : ""}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="md:col-span-2 flex justify-end pt-4 border-t border-slate-100 mt-2">
                  <button type="submit" disabled={updateMutation.isPending}
                    className="w-full md:w-auto px-6 py-3 bg-[#2563eb] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] shadow-md shadow-blue-200 transition-all disabled:opacity-70">
                    {updateMutation.isPending ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════ SALARY SECTION ═══════════ */}
            {activeSection === "salary" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

                <SectionHeading title="Pay Structure" subtitle="Base salary and earnings" />

                <FormField label="Salary Type">
                  <select className={selectCls} value={formData.salaryType} onChange={set("salaryType")}>
                    {["Monthly", "Daily", "Hourly", "Contract"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Currency">
                  <select className={selectCls} value={formData.currency} onChange={set("currency")}>
                    {["NPR", "USD", "EUR", "GBP", "INR", "AED"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label={`Basic Salary (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls + " font-semibold text-blue-600"} placeholder="0" value={formData.salary} onChange={set("salary")} />
                </FormField>

                <FormField label={`Allowances (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={formData.allowances} onChange={set("allowances")} />
                </FormField>

                <FormField label={`Overtime (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={formData.overtime} onChange={set("overtime")} />
                </FormField>

                <FormField label="Effective From">
                  <input type="date" className={inputCls} value={formData.salaryEffectiveDate} onChange={set("salaryEffectiveDate")} />
                </FormField>

                <SectionHeading title="Deductions" subtitle="Tax, insurance, and other deductions" />

                <FormField label={`Tax (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={formData.tax} onChange={set("tax")} />
                </FormField>

                <FormField label={`Insurance (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={formData.insurance} onChange={set("insurance")} />
                </FormField>

                {/* Live Pay Summary */}
                <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-4 mt-2">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Pay Summary (Live Preview)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] text-slate-400">Gross Pay</p>
                      <p className="text-[15px] font-bold text-slate-800 mt-0.5">{formData.currency} {grossPay.toLocaleString()}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-slate-100">
                      <p className="text-[10px] text-slate-400">Deductions</p>
                      <p className="text-[15px] font-bold text-red-500 mt-0.5">
                        − {formData.currency} {((parseFloat(formData.tax) || 0) + (parseFloat(formData.insurance) || 0)).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-100 bg-blue-50">
                      <p className="text-[10px] text-blue-500">Net Pay</p>
                      <p className="text-[15px] font-bold text-blue-600 mt-0.5">{formData.currency} {netPay.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <FormField label="Salary Notes" span2>
                  <textarea
                    rows={3}
                    className={inputCls + " resize-none"}
                    placeholder="e.g. Revised salary effective from July 2026…"
                    value={formData.salaryNotes}
                    onChange={set("salaryNotes")}
                  />
                </FormField>

                <div className="md:col-span-2 flex justify-end pt-4 border-t border-slate-100 mt-2">
                  <button type="submit" disabled={updateMutation.isPending}
                    className="w-full md:w-auto px-6 py-3 bg-[#2563eb] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] shadow-md shadow-blue-200 transition-all disabled:opacity-70">
                    {updateMutation.isPending ? "Saving…" : "Save Salary Info"}
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════ BANK SECTION ═══════════ */}
            {activeSection === "bank" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">

                <SectionHeading title="Bank Account" subtitle="Payment destination for salary" />

                <FormField label="Bank Name">
                  <input type="text" className={inputCls} placeholder="e.g. Nepal Bank Ltd." value={formData.bankName} onChange={set("bankName")} />
                </FormField>

                <FormField label="Account Holder Name">
                  <input type="text" className={inputCls} placeholder="Full name as on account" value={formData.accountHolderName} onChange={set("accountHolderName")} />
                </FormField>

                <FormField label="Account Number">
                  <input type="text" className={inputCls} placeholder="XXXX XXXX XXXX" value={formData.bankAccountNumber} onChange={set("bankAccountNumber")} />
                </FormField>

                <FormField label="IFSC / SWIFT Code">
                  <input type="text" className={inputCls} placeholder="e.g. NBLNP000" value={formData.ifscSwiftCode} onChange={set("ifscSwiftCode")} />
                </FormField>

                <FormField label="Payment Method" span2>
                  <select className={selectCls} value={formData.paymentMethod} onChange={set("paymentMethod")}>
                    {["Bank Transfer", "Cash", "Cheque", "Mobile Wallet"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </FormField>

                <SectionHeading title="Tax & Statutory IDs" subtitle="Government and compliance identifiers" />

                <FormField label="PAN / Tax Number">
                  <input type="text" className={inputCls} placeholder="e.g. ABCDE1234F" value={formData.panTaxNumber} onChange={set("panTaxNumber")} />
                </FormField>

                <FormField label="PF Number">
                  <input type="text" className={inputCls} placeholder="Provident Fund ID" value={formData.pfNumber} onChange={set("pfNumber")} />
                </FormField>

                <FormField label="ESI Number">
                  <input type="text" className={inputCls} placeholder="Employee State Insurance ID" value={formData.esiNumber} onChange={set("esiNumber")} />
                </FormField>

                <div className="md:col-span-2 flex justify-end pt-4 border-t border-slate-100 mt-2">
                  <button type="submit" disabled={updateMutation.isPending}
                    className="w-full md:w-auto px-6 py-3 bg-[#2563eb] text-white text-sm font-semibold rounded-xl hover:bg-blue-700 active:scale-[0.98] shadow-md shadow-blue-200 transition-all disabled:opacity-70">
                    {updateMutation.isPending ? "Saving…" : "Save Bank Details"}
                  </button>
                </div>
              </div>
            )}

          </div>
        </form>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Quick Info */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Quick Info Summary</h3>
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Employee ID</span>
                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  {formData.employeeId || "—"}
                  <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">Auto</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Gross Pay</span>
                <span className="text-sm font-bold text-blue-600">{formData.currency} {grossPay.toLocaleString() || "0"}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Net Pay</span>
                <span className="text-sm font-bold text-green-600">{formData.currency} {netPay.toLocaleString() || "0"}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Shift</span>
                <span className="text-sm font-bold text-slate-800">{selectedShift?.name || "Not assigned"}</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide block mb-0.5">Employment Type</span>
                <span className="text-sm font-bold text-slate-800">{formData.employmentType || "—"}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-400 italic">
                Fields modified here update across all CRM modules dynamically.
              </div>
            </div>
          </div>

          {/* Bank snapshot */}
          {activeSection === "bank" && (formData.bankName || formData.bankAccountNumber) && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Bank Snapshot</h3>
              <div className="space-y-3">
                {formData.bankName && (
                  <div>
                    <span className="text-[10px] text-slate-400 block">Bank</span>
                    <span className="text-sm font-semibold text-slate-800">{formData.bankName}</span>
                  </div>
                )}
                {formData.bankAccountNumber && (
                  <div>
                    <span className="text-[10px] text-slate-400 block">Account</span>
                    <span className="text-sm font-mono font-semibold text-slate-800">
                      {"•".repeat(Math.max(0, formData.bankAccountNumber.length - 4)) + formData.bankAccountNumber.slice(-4)}
                    </span>
                  </div>
                )}
                {formData.paymentMethod && (
                  <div>
                    <span className="text-[10px] text-slate-400 block">Method</span>
                    <span className="text-sm font-semibold text-slate-800">{formData.paymentMethod}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Salary snapshot */}
          {activeSection === "salary" && (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-6 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Salary Breakdown</h3>
              <div className="space-y-2">
                {[
                  { label: "Basic", value: formData.salary, color: "text-slate-800" },
                  { label: "Allowances", value: formData.allowances, color: "text-green-600" },
                  { label: "Overtime", value: formData.overtime, color: "text-green-600" },
                  { label: "Tax", value: formData.tax ? `-${formData.tax}` : "", color: "text-red-500" },
                  { label: "Insurance", value: formData.insurance ? `-${formData.insurance}` : "", color: "text-red-500" },
                ].map(({ label, value, color }) =>
                  value ? (
                    <div key={label} className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-400">{label}</span>
                      <span className={`text-[12px] font-semibold ${color}`}>{formData.currency} {Number(value.replace("-","")).toLocaleString()}</span>
                    </div>
                  ) : null
                )}
                <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[11px] font-bold text-slate-600">Net Pay</span>
                  <span className="text-[13px] font-bold text-blue-600">{formData.currency} {netPay.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}