import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  X,
  Building2,
  CalendarDays,
} from "lucide-react";
import toast from "react-hot-toast";
import { employeesAPI } from "@/api/employees.api";
import usePermission from "@/hooks/usePermission";

/*
|--------------------------------------------------------------------------
| Employee Background — education + past work experience
|--------------------------------------------------------------------------
|
| Kept as its own component rather than another branch inside
| EmployeeDetail.jsx, which is already 2,000 lines. Everything this tab
| needs — its queries, its mutations, its two modals — lives here, so the
| detail page only gains an import, a tab entry and one render line.
|
| The summary strip at the top (fresher/experienced, total experience,
| highest qualification, how many rows still need verifying) comes from
| the server via GET /employees/:id/background. It is deliberately NOT
| computed in the browser: the server already merges overlapping
| employment periods when it totals experience, and a second
| implementation here would eventually disagree with it.
*/

const EDU_LEVELS = [
  "SEE/SLC",
  "+2/Intermediate",
  "Diploma",
  "Bachelor",
  "Master",
  "MPhil",
  "PhD",
  "Certification",
  "Other",
];

const GRADE_TYPES = ["Not Applicable", "Percentage", "GPA", "Division", "Grade"];

const EMPLOYMENT_TYPES = [
  "Full-Time",
  "Part-Time",
  "Contract",
  "Internship",
  "Freelance",
  "Consultant",
];

const EMPTY_EDU = {
  level: "Bachelor",
  degree: "",
  fieldOfStudy: "",
  institution: "",
  board: "",
  startYear: "",
  endYear: "",
  isPursuing: false,
  gradeType: "Not Applicable",
  gradeValue: "",
  documentUrl: "",
  notes: "",
};

const EMPTY_EXP = {
  companyName: "",
  designation: "",
  department: "",
  employmentType: "Full-Time",
  location: "",
  startDate: "",
  endDate: "",
  isCurrent: false,
  lastSalary: "",
  currency: "NPR",
  responsibilities: "",
  reasonForLeaving: "",
  referenceName: "",
  referenceDesignation: "",
  referenceContact: "",
  documentUrl: "",
  notes: "",
};

const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short" })
    : "—";

export default function BackgroundTab({ employeeId }) {
  const queryClient = useQueryClient();
  const { hasPermission, isAdmin } = usePermission();

  const canEdit = hasPermission("employees.update");
  // Verification is an admin/manager act — the server enforces the same
  // rule, so hiding the button here only saves the user a 403.
  const canVerify = isAdmin || hasPermission("employees.approve");

  const [eduModal, setEduModal] = useState(null); // null | {} | existing row
  const [expModal, setExpModal] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["employee-background", employeeId],
    queryFn: () => employeesAPI.getBackground(employeeId).then((r) => r.data),
    enabled: !!employeeId,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["employee-background", employeeId] });
    // The summary columns live on the employee row too, so the header
    // and the employee list stay in step.
    queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
  };

  const mutation = (fn, successMessage) =>
    useMutation({
      mutationFn: fn,
      onSuccess: () => {
        toast.success(successMessage);
        refresh();
        setEduModal(null);
        setExpModal(null);
      },
      onError: (err) =>
        toast.error(err.response?.data?.message || "Something went wrong"),
    });

  const saveEdu = mutation(
    (values) =>
      values.id
        ? employeesAPI.updateEducation(employeeId, values.id, values)
        : employeesAPI.addEducation(employeeId, values),
    "Education saved"
  );

  const removeEdu = mutation(
    (eduId) => employeesAPI.deleteEducation(employeeId, eduId),
    "Education removed"
  );

  const verifyEdu = mutation(
    ({ eduId, isVerified }) =>
      employeesAPI.verifyEducation(employeeId, eduId, isVerified),
    "Verification updated"
  );

  const saveExp = mutation(
    (values) =>
      values.id
        ? employeesAPI.updateExperience(employeeId, values.id, values)
        : employeesAPI.addExperience(employeeId, values),
    "Experience saved"
  );

  const removeExp = mutation(
    (expId) => employeesAPI.deleteExperience(employeeId, expId),
    "Experience removed"
  );

  const verifyExp = mutation(
    ({ expId, isVerified }) =>
      employeesAPI.verifyExperience(employeeId, expId, isVerified),
    "Verification updated"
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-24 rounded-xl animate-pulse"
            style={{ background: "var(--surface-2)" }}
          />
        ))}
      </div>
    );
  }

  const educations = data?.educations || [];
  const experiences = data?.experiences || [];
  const isFresher = data?.employmentBackground === "Fresher";

  return (
    <div className="space-y-6">
      {/* ── Summary strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Background"
          value={data?.employmentBackground || "Fresher"}
          tone={isFresher ? "info" : "good"}
        />
        <SummaryCard
          label="Total experience"
          value={isFresher && !experiences.length ? "—" : data?.totalExperienceLabel || "0 mo"}
          sub={experiences.length ? `${experiences.length} previous role${experiences.length === 1 ? "" : "s"}` : "no prior roles"}
        />
        <SummaryCard
          label="Highest qualification"
          value={data?.highestEducation || "—"}
          sub={`${educations.length} record${educations.length === 1 ? "" : "s"}`}
        />
        <SummaryCard
          label="Pending verification"
          value={data?.unverifiedCount ?? 0}
          tone={data?.unverifiedCount > 0 ? "warn" : "good"}
          sub={data?.unverifiedCount > 0 ? "needs HR sign-off" : "all checked"}
        />
      </div>

      {/* ── Education ─────────────────────────────────────────── */}
      <Section
        icon={GraduationCap}
        title="Education"
        subtitle="Qualifications, newest first"
        action={
          canEdit && (
            <button
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              onClick={() => setEduModal({ ...EMPTY_EDU })}
            >
              <Plus size={15} /> Add Education
            </button>
          )
        }
      >
        {educations.length === 0 ? (
          <EmptyRow text="No education records yet." />
        ) : (
          educations.map((edu) => (
            <RecordRow
              key={edu.id}
              title={edu.degree}
              badge={edu.level}
              subtitle={[edu.institution, edu.board].filter(Boolean).join(" · ")}
              meta={[
                edu.fieldOfStudy,
                edu.startYear || edu.endYear
                  ? `${edu.startYear || "?"} – ${edu.isPursuing ? "present" : edu.endYear || "?"}`
                  : null,
                edu.gradeType !== "Not Applicable" && edu.gradeValue
                  ? `${edu.gradeType}: ${edu.gradeValue}`
                  : null,
              ]}
              notes={edu.notes}
              documentUrl={edu.documentUrl}
              isVerified={edu.isVerified}
              isPursuing={edu.isPursuing}
              canEdit={canEdit}
              canVerify={canVerify}
              onEdit={() => setEduModal(edu)}
              onDelete={() => {
                if (window.confirm(`Remove "${edu.degree}"?`)) removeEdu.mutate(edu.id);
              }}
              onVerify={() =>
                verifyEdu.mutate({ eduId: edu.id, isVerified: !edu.isVerified })
              }
            />
          ))
        )}
      </Section>

      {/* ── Work experience ───────────────────────────────────── */}
      <Section
        icon={Briefcase}
        title="Previous Work Experience"
        subtitle="Roles held before joining this company"
        action={
          canEdit && (
            <button
              className="btn btn-primary btn-sm flex items-center gap-1.5"
              onClick={() => setExpModal({ ...EMPTY_EXP })}
            >
              <Plus size={15} /> Add Experience
            </button>
          )
        }
      >
        {experiences.length === 0 ? (
          <EmptyRow
            text={
              isFresher
                ? "Marked as a fresher — no prior employment recorded."
                : "No experience records yet."
            }
          />
        ) : (
          experiences.map((exp) => (
            <RecordRow
              key={exp.id}
              title={exp.designation}
              badge={exp.employmentType}
              subtitle={[exp.companyName, exp.department, exp.location]
                .filter(Boolean)
                .join(" · ")}
              meta={[
                `${fmtDate(exp.startDate)} – ${exp.isCurrent ? "present" : fmtDate(exp.endDate)}`,
                exp.lastSalary ? `Last drawn: ${exp.currency} ${exp.lastSalary}` : null,
                exp.reasonForLeaving ? `Left: ${exp.reasonForLeaving}` : null,
                exp.referenceName
                  ? `Ref: ${exp.referenceName}${exp.referenceContact ? ` (${exp.referenceContact})` : ""}`
                  : null,
              ]}
              notes={exp.responsibilities}
              documentUrl={exp.documentUrl}
              isVerified={exp.isVerified}
              canEdit={canEdit}
              canVerify={canVerify}
              onEdit={() => setExpModal(exp)}
              onDelete={() => {
                if (window.confirm(`Remove "${exp.designation} @ ${exp.companyName}"?`))
                  removeExp.mutate(exp.id);
              }}
              onVerify={() =>
                verifyExp.mutate({ expId: exp.id, isVerified: !exp.isVerified })
              }
            />
          ))
        )}
      </Section>

      {eduModal && (
        <EducationModal
          initial={eduModal}
          saving={saveEdu.isPending}
          onClose={() => setEduModal(null)}
          onSave={(values) => saveEdu.mutate(values)}
        />
      )}

      {expModal && (
        <ExperienceModal
          initial={expModal}
          saving={saveExp.isPending}
          onClose={() => setExpModal(null)}
          onSave={(values) => saveExp.mutate(values)}
        />
      )}
    </div>
  );
}

/* ── Presentational pieces ────────────────────────────────── */

function SummaryCard({ label, value, sub, tone }) {
  const colors = {
    good: "var(--success)",
    warn: "var(--warning)",
    info: "var(--info)",
  };
  return (
    <div className="card p-3 sm:p-4">
      <p
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="text-[15px] sm:text-[17px] font-bold mt-1.5 break-words leading-tight"
        style={{ color: colors[tone] || "var(--text-primary)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, action, children }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--surface-2)" }}
          >
            <Icon size={16} style={{ color: "var(--text-muted)" }} />
          </div>
          <div className="min-w-0">
            <h2
              className="text-[15px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function EmptyRow({ text }) {
  return (
    <div
      className="card p-8 text-center text-[13px]"
      style={{ color: "var(--text-muted)" }}
    >
      {text}
    </div>
  );
}

function RecordRow({
  title,
  badge,
  subtitle,
  meta = [],
  notes,
  documentUrl,
  isVerified,
  isPursuing,
  canEdit,
  canVerify,
  onEdit,
  onDelete,
  onVerify,
}) {
  return (
    <div className="card p-3.5 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-[14px] font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </h3>
            {badge && <span className="badge badge-gray">{badge}</span>}
            {isPursuing && <span className="badge badge-info">In progress</span>}
            {isVerified ? (
              <span className="badge badge-success flex items-center gap-1">
                <ShieldCheck size={11} /> Verified
              </span>
            ) : (
              <span className="badge badge-warning flex items-center gap-1">
                <ShieldAlert size={11} /> Unverified
              </span>
            )}
          </div>

          {subtitle && (
            <p
              className="text-[13px] mt-1 flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <Building2 size={12} style={{ color: "var(--text-muted)" }} />
              {subtitle}
            </p>
          )}

          {meta.filter(Boolean).length > 0 && (
            <div
              className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              {meta.filter(Boolean).map((m, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i === 0 && <CalendarDays size={11} />}
                  {m}
                </span>
              ))}
            </div>
          )}

          {notes && (
            <p
              className="text-[12px] mt-2 whitespace-pre-line leading-relaxed"
              style={{ color: "var(--text-secondary)" }}
            >
              {notes}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {documentUrl && (
            <a
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              <ExternalLink size={13} /> Doc
            </a>
          )}
          {canVerify && (
            <button
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={onVerify}
              title={isVerified ? "Mark as unverified" : "Mark as verified"}
            >
              {isVerified ? <ShieldAlert size={13} /> : <ShieldCheck size={13} />}
            </button>
          )}
          {canEdit && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={onEdit} title="Edit">
                <Pencil size={13} />
              </button>
              <button className="btn btn-danger btn-sm" onClick={onDelete} title="Delete">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Modals ───────────────────────────────────────────────── */

function Modal({ title, onClose, children, footer }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        className="card w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ background: "var(--surface)" }}
      >
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h3 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">{children}</div>

        <div
          className="flex justify-end gap-2 p-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

function EducationModal({ initial, saving, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = () => {
    if (!form.degree?.trim() || !form.institution?.trim()) {
      toast.error("Degree and institution are required.");
      return;
    }
    // Empty strings would fail the server's integer validation; send null.
    onSave({
      ...form,
      startYear: form.startYear ? Number(form.startYear) : null,
      endYear: form.endYear ? Number(form.endYear) : null,
    });
  };

  return (
    <Modal
      title={form.id ? "Edit Education" : "Add Education"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Level" required>
          <select className="input" value={form.level} onChange={set("level")}>
            {EDU_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Degree / Course" required>
          <input
            className="input"
            value={form.degree}
            onChange={set("degree")}
            placeholder="Bachelor of Computer Application"
          />
        </Field>

        <Field label="Field of Study">
          <input
            className="input"
            value={form.fieldOfStudy || ""}
            onChange={set("fieldOfStudy")}
            placeholder="Computer Science"
          />
        </Field>

        <Field label="Institution" required>
          <input
            className="input"
            value={form.institution}
            onChange={set("institution")}
            placeholder="Kathmandu College"
          />
        </Field>

        <Field label="Board / University">
          <input
            className="input"
            value={form.board || ""}
            onChange={set("board")}
            placeholder="Tribhuvan University"
          />
        </Field>

        <Field label="Certificate URL">
          <input
            className="input"
            value={form.documentUrl || ""}
            onChange={set("documentUrl")}
            placeholder="https://…"
          />
        </Field>

        <Field label="Start Year">
          <input
            type="number"
            className="input"
            value={form.startYear || ""}
            onChange={set("startYear")}
            placeholder="2018"
          />
        </Field>

        <Field label="End Year">
          <input
            type="number"
            className="input"
            value={form.endYear || ""}
            onChange={set("endYear")}
            placeholder="2022"
            disabled={false}
          />
        </Field>

        <Field label="Grading System">
          <select className="input" value={form.gradeType} onChange={set("gradeType")}>
            {GRADE_TYPES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Grade / Score">
          <input
            className="input"
            value={form.gradeValue || ""}
            onChange={set("gradeValue")}
            placeholder="3.6 or 78%"
            disabled={form.gradeType === "Not Applicable"}
          />
        </Field>

        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="isPursuing"
            checked={!!form.isPursuing}
            onChange={set("isPursuing")}
          />
          <label htmlFor="isPursuing" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Currently studying — end year is the expected completion
          </label>
        </div>

        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea
              className="input"
              rows={2}
              value={form.notes || ""}
              onChange={set("notes")}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function ExperienceModal({ initial, saving, onClose, onSave }) {
  const [form, setForm] = useState(initial);
  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const submit = () => {
    if (!form.companyName?.trim() || !form.designation?.trim() || !form.startDate) {
      toast.error("Company, designation and start date are required.");
      return;
    }
    onSave({
      ...form,
      // The server clears endDate when isCurrent is set, but sending a
      // stale value would make the request contradict itself.
      endDate: form.isCurrent ? null : form.endDate || null,
      lastSalary: form.lastSalary ? Number(form.lastSalary) : null,
    });
  };

  return (
    <Modal
      title={form.id ? "Edit Experience" : "Add Work Experience"}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Company Name" required>
          <input
            className="input"
            value={form.companyName}
            onChange={set("companyName")}
            placeholder="Previous employer"
          />
        </Field>

        <Field label="Designation" required>
          <input
            className="input"
            value={form.designation}
            onChange={set("designation")}
            placeholder="Software Engineer"
          />
        </Field>

        <Field label="Department">
          <input className="input" value={form.department || ""} onChange={set("department")} />
        </Field>

        <Field label="Employment Type">
          <select className="input" value={form.employmentType} onChange={set("employmentType")}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Location">
          <input
            className="input"
            value={form.location || ""}
            onChange={set("location")}
            placeholder="Kathmandu"
          />
        </Field>

        <Field label="Experience Letter URL">
          <input
            className="input"
            value={form.documentUrl || ""}
            onChange={set("documentUrl")}
            placeholder="https://…"
          />
        </Field>

        <Field label="Start Date" required>
          <input
            type="date"
            className="input"
            value={form.startDate ? String(form.startDate).slice(0, 10) : ""}
            onChange={set("startDate")}
          />
        </Field>

        <Field label="End Date">
          <input
            type="date"
            className="input"
            value={form.endDate ? String(form.endDate).slice(0, 10) : ""}
            onChange={set("endDate")}
            disabled={!!form.isCurrent}
          />
        </Field>

        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="isCurrent"
            checked={!!form.isCurrent}
            onChange={set("isCurrent")}
          />
          <label htmlFor="isCurrent" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Still working there (serving notice)
          </label>
        </div>

        <Field label="Last Drawn Salary">
          <input
            type="number"
            className="input"
            value={form.lastSalary || ""}
            onChange={set("lastSalary")}
          />
        </Field>

        <Field label="Currency">
          <input className="input" value={form.currency || "NPR"} onChange={set("currency")} />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Key Responsibilities">
            <textarea
              className="input"
              rows={3}
              value={form.responsibilities || ""}
              onChange={set("responsibilities")}
              placeholder="What they were accountable for"
            />
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field label="Reason for Leaving">
            <input
              className="input"
              value={form.reasonForLeaving || ""}
              onChange={set("reasonForLeaving")}
            />
          </Field>
        </div>

        <Field label="Reference Name">
          <input
            className="input"
            value={form.referenceName || ""}
            onChange={set("referenceName")}
          />
        </Field>

        <Field label="Reference Designation">
          <input
            className="input"
            value={form.referenceDesignation || ""}
            onChange={set("referenceDesignation")}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Reference Contact">
            <input
              className="input"
              value={form.referenceContact || ""}
              onChange={set("referenceContact")}
              placeholder="Phone or email"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}