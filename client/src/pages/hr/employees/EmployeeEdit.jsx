import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { employeesAPI } from "@/api/employees.api";
import { shiftsAPI } from "@/api/shifts.api";
import toast from "react-hot-toast";

// ─── Shared class strings (dark + light) ─────────────────────
const inputCls =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 " +
  "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 " +
  "bg-white dark:bg-slate-800/60 " +
  "text-sm font-medium text-slate-800 dark:text-slate-100 " +
  "placeholder:text-slate-400 dark:placeholder:text-slate-500 " +
  "transition-all disabled:opacity-50 disabled:cursor-not-allowed";

const selectCls =
  "w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 " +
  "focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 " +
  "bg-white dark:bg-slate-800/60 " +
  "text-sm font-medium text-slate-800 dark:text-slate-100 transition-all";

// ─── Reusable field wrapper ───────────────────────────────────
function FormField({ label, children, span2 = false }) {
  return (
    <div className={span2 ? "md:col-span-2" : ""}>
      <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400 dark:text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─── Section divider ─────────────────────────────────────────
function SectionHeading({ icon, title, subtitle }) {
  return (
    <div className="md:col-span-2 flex items-start gap-3 pt-2 pb-1 mt-2 border-t border-slate-100 dark:border-slate-700/60">
      {icon && (
        <span className="text-lg mt-0.5">{icon}</span>
      )}
      <div>
        <h3 className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Tab bar constants ────────────────────────────────────────
const ACTIVE_TAB =
  "text-sm font-semibold text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 pb-3 cursor-pointer whitespace-nowrap transition-colors";
const IDLE_TAB =
  "text-sm font-medium text-slate-400 dark:text-slate-500 border-b-2 border-transparent pb-3 cursor-pointer whitespace-nowrap hover:text-slate-600 dark:hover:text-slate-300 transition-colors";

// ─── Stat pill ───────────────────────────────────────────────
function StatRow({ label, value, valueClass = "" }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{label}</span>
      <span className={`text-[13px] font-bold ${valueClass || "text-slate-800 dark:text-slate-100"}`}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
export default function EmployeeEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState("details");

  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    department: "", designation: "", shiftId: "",
    employmentType: "Full-Time", workLocation: "", employeeId: "",
    salary: "", salaryType: "Monthly", currency: "NPR",
    allowances: "", overtime: "", tax: "", insurance: "",
    salaryEffectiveDate: "", salaryNotes: "",
    bankName: "", accountHolderName: "", bankAccountNumber: "",
    ifscSwiftCode: "", paymentMethod: "Bank Transfer",
    panTaxNumber: "", pfNumber: "", esiNumber: "",
  });

  // ── Queries ─────────────────────────────────────────────────
  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => employeesAPI.getById(id).then((r) => r.data),
  });

  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => shiftsAPI.getAll().then((r) => r.data),
  });
  const shifts = shiftData?.shifts || shiftData || [];

  // ── Seed form ───────────────────────────────────────────────
  useEffect(() => {
    if (!employee) return;
    setFormData({
      firstName:           employee.firstName || "",
      lastName:            employee.lastName || "",
      email:               employee.email || "",
      phone:               employee.phone || "",
      department:          employee.department || "",
      designation:         employee.designation || "",
      shiftId:             employee.shiftId || employee.shift?.id || "",
      employmentType:      employee.employmentType || "Full-Time",
      workLocation:        employee.workLocation || "",
      employeeId:          employee.employeeId || "",
      salary:              employee.salary ?? "",
      salaryType:          employee.salaryType || "Monthly",
      currency:            employee.currency || "NPR",
      allowances:          employee.allowances ?? "",
      overtime:            employee.overtime ?? "",
      tax:                 employee.tax ?? "",
      insurance:           employee.insurance ?? "",
      salaryEffectiveDate: employee.salaryEffectiveDate || "",
      salaryNotes:         employee.salaryNotes || "",
      bankName:            employee.bankName || "",
      accountHolderName:   employee.accountHolderName || "",
      bankAccountNumber:   employee.bankAccountNumber || "",
      ifscSwiftCode:       employee.ifscSwiftCode || "",
      paymentMethod:       employee.paymentMethod || "Bank Transfer",
      panTaxNumber:        employee.panTaxNumber || "",
      pfNumber:            employee.pfNumber || "",
      esiNumber:           employee.esiNumber || "",
    });
  }, [employee]);

  // ── Mutation ─────────────────────────────────────────────────
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
    const { employeeId: _eid, ...payload } = formData;
    updateMutation.mutate(payload);
  };

  // ── Derived ──────────────────────────────────────────────────
  const grossPay =
    (parseFloat(formData.salary) || 0) +
    (parseFloat(formData.allowances) || 0) +
    (parseFloat(formData.overtime) || 0);
  const deductions =
    (parseFloat(formData.tax) || 0) +
    (parseFloat(formData.insurance) || 0);
  const netPay = grossPay - deductions;
  const selectedShift = shifts.find((s) => s.id === formData.shiftId);
  const initials = formData.firstName ? formData.firstName.charAt(0).toUpperCase() : "E";

  // ── Loading ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-100 dark:border-blue-900 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 dark:text-slate-500">Loading employee…</p>
        </div>
      </div>
    );
  }

  // ── Save button ──────────────────────────────────────────────
  const SaveBtn = ({ label = "Save Changes" }) => (
    <div className="md:col-span-2 flex justify-end pt-4 border-t border-slate-100 dark:border-slate-700/60 mt-2">
      <button
        type="submit"
        disabled={updateMutation.isPending}
        className="w-full md:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all disabled:opacity-60"
      >
        {updateMutation.isPending ? "Saving…" : label}
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-4 sm:p-8 transition-colors">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">

        {/* Left: back + avatar + name */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-400 transition-colors shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>

          {/* Avatar */}
          <div className="w-11 h-11 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 font-bold text-lg flex items-center justify-center border border-amber-200 dark:border-amber-800/60 shrink-0">
            {initials}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                {formData.firstName || "Edit"} {formData.lastName || "Employee"}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                active
              </span>
            </div>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-0.5 truncate">
              {formData.designation || "—"} · {formData.department || "—"}
            </p>
          </div>
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-sm transition-all w-full sm:w-auto"
        >
          Cancel
        </button>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Form Card ── */}
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden"
        >
          {/* Tab bar */}
          <div className="border-b border-slate-100 dark:border-slate-700/60 px-5 pt-4 flex gap-6 overflow-x-auto">
            {[
              { key: "details", label: "Edit Details" },
              { key: "salary",  label: "Salary & Pay" },
              { key: "bank",    label: "Bank Details" },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key)}
                className={activeSection === key ? ACTIVE_TAB : IDLE_TAB}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5 sm:p-7">

            {/* ══ DETAILS ══ */}
            {activeSection === "details" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <FormField label="Employee ID">
                  <div className="relative">
                    <input
                      readOnly
                      className={inputCls + " pr-16"}
                      value={formData.employeeId || "Auto-assigned"}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/60">
                      Auto
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Assigned automatically — cannot be changed.
                  </p>
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

                <SaveBtn label="Save Changes" />
              </div>
            )}

            {/* ══ SALARY ══ */}
            {activeSection === "salary" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <SectionHeading icon="💰" title="Pay Structure" subtitle="Base salary and earnings" />

                <FormField label="Salary Type">
                  <select className={selectCls} value={formData.salaryType} onChange={set("salaryType")}>
                    {["Monthly", "Daily", "Hourly", "Contract"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </FormField>

                <FormField label="Currency">
                  <select className={selectCls} value={formData.currency} onChange={set("currency")}>
                    {["NPR", "USD", "EUR", "GBP", "INR", "AED"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </FormField>

                <FormField label={`Basic Salary (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls + " font-semibold text-blue-600 dark:text-blue-400"} placeholder="0" value={formData.salary} onChange={set("salary")} />
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

                <SectionHeading icon="📉" title="Deductions" subtitle="Tax, insurance, and other deductions" />

                <FormField label={`Tax (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={formData.tax} onChange={set("tax")} />
                </FormField>

                <FormField label={`Insurance (${formData.currency})`}>
                  <input type="number" min="0" className={inputCls} placeholder="0" value={formData.insurance} onChange={set("insurance")} />
                </FormField>

                {/* Live Pay Summary */}
                <div className="md:col-span-2 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/40 p-4 mt-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                    Live Pay Preview
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Gross Pay", value: `${formData.currency} ${grossPay.toLocaleString()}`, cls: "text-slate-800 dark:text-slate-100" },
                      { label: "Deductions", value: `− ${formData.currency} ${deductions.toLocaleString()}`, cls: "text-red-500 dark:text-red-400" },
                      { label: "Net Pay", value: `${formData.currency} ${netPay.toLocaleString()}`, cls: "text-blue-600 dark:text-blue-400", highlight: true },
                    ].map(({ label, value, cls, highlight }) => (
                      <div
                        key={label}
                        className={`rounded-xl p-3 border ${highlight
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/40"
                          : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/60"}`}
                      >
                        <p className={`text-[10px] mb-0.5 ${highlight ? "text-blue-500 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`}>{label}</p>
                        <p className={`text-[14px] font-bold ${cls}`}>{value}</p>
                      </div>
                    ))}
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

                <SaveBtn label="Save Salary Info" />
              </div>
            )}

            {/* ══ BANK ══ */}
            {activeSection === "bank" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                <SectionHeading icon="🏦" title="Bank Account" subtitle="Payment destination for salary" />

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
                    {["Bank Transfer", "Cash", "Cheque", "Mobile Wallet"].map((m) => <option key={m}>{m}</option>)}
                  </select>
                </FormField>

                <SectionHeading icon="🪪" title="Tax & Statutory IDs" subtitle="Government and compliance identifiers" />

                <FormField label="PAN / Tax Number">
                  <input type="text" className={inputCls} placeholder="e.g. ABCDE1234F" value={formData.panTaxNumber} onChange={set("panTaxNumber")} />
                </FormField>

                <FormField label="PF Number">
                  <input type="text" className={inputCls} placeholder="Provident Fund ID" value={formData.pfNumber} onChange={set("pfNumber")} />
                </FormField>

                <FormField label="ESI Number">
                  <input type="text" className={inputCls} placeholder="Employee State Insurance ID" value={formData.esiNumber} onChange={set("esiNumber")} />
                </FormField>

                <SaveBtn label="Save Bank Details" />
              </div>
            )}

          </div>
        </form>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Quick Info Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Quick Summary</p>
            <div>
              <StatRow
                label="Employee ID"
                value={
                  <span className="flex items-center gap-1.5">
                    {formData.employeeId || "—"}
                    <span className="text-[9px] font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-800/50">Auto</span>
                  </span>
                }
              />
              <StatRow label="Gross Pay" value={`${formData.currency} ${grossPay.toLocaleString()}`} valueClass="text-blue-600 dark:text-blue-400" />
              <StatRow label="Net Pay" value={`${formData.currency} ${netPay.toLocaleString()}`} valueClass="text-emerald-600 dark:text-emerald-400" />
              <StatRow label="Shift" value={selectedShift?.name || "Not assigned"} />
              <StatRow label="Employment" value={formData.employmentType || "—"} />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
              Changes update across all CRM modules dynamically.
            </p>
          </div>

          {/* Salary Breakdown (salary tab) */}
          {activeSection === "salary" && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Salary Breakdown</p>
              {[
                { label: "Basic",      value: formData.salary,     cls: "text-slate-800 dark:text-slate-100" },
                { label: "Allowances", value: formData.allowances, cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Overtime",   value: formData.overtime,   cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Tax",        value: formData.tax,        cls: "text-red-500 dark:text-red-400", prefix: "−" },
                { label: "Insurance",  value: formData.insurance,  cls: "text-red-500 dark:text-red-400", prefix: "−" },
              ].map(({ label, value, cls, prefix }) =>
                value ? (
                  <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">{label}</span>
                    <span className={`text-[12px] font-semibold ${cls}`}>
                      {prefix ? `${prefix} ` : ""}{formData.currency} {Number(String(value).replace("-", "")).toLocaleString()}
                    </span>
                  </div>
                ) : null
              )}
              <div className="flex justify-between items-center pt-2.5 mt-1">
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Net Pay</span>
                <span className="text-[14px] font-bold text-blue-600 dark:text-blue-400">{formData.currency} {netPay.toLocaleString()}</span>
              </div>
            </div>
          )}

          {/* Bank Snapshot (bank tab) */}
          {activeSection === "bank" && (formData.bankName || formData.bankAccountNumber) && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">Bank Snapshot</p>
              {formData.bankName && (
                <div className="mb-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Bank</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formData.bankName}</span>
                </div>
              )}
              {formData.bankAccountNumber && (
                <div className="mb-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Account</span>
                  <span className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-100">
                    {"•".repeat(Math.max(0, formData.bankAccountNumber.length - 4)) + formData.bankAccountNumber.slice(-4)}
                  </span>
                </div>
              )}
              {formData.paymentMethod && (
                <div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 block">Method</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{formData.paymentMethod}</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}