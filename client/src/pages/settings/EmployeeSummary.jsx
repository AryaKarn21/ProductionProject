import { useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Briefcase,
  Calendar,
  Building2,
  UserCheck,
  ArrowRight,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/Button";

export default function EmployeeSummary({ user }) {
  const navigate = useNavigate();
  const employee = user?.employee;
  const hasEmployeeRecord = !!employee?.id;

  const items = [
    {
      icon: BadgeCheck,
      label: "Employee ID",
      value: employee?.employeeId || "Not Assigned",
    },
    {
      icon: Building2,
      label: "Department",
      value: employee?.department || "-",
    },
    {
      icon: Briefcase,
      label: "Designation",
      value: employee?.designation || "-",
    },
    {
      icon: Calendar,
      label: "Joining Date",
      value: employee?.joinDate
        ? new Date(employee.joinDate).toLocaleDateString()
        : "-",
    },
    {
      icon: UserCheck,
      label: "Reporting Manager",
      value: employee?.reportingManager?.name || "-",
    },
  ];

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-4 sm:px-5 border-b flex items-center justify-between gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Briefcase size={18} style={{ color: "var(--primary)" }} />

            <h2
              className="text-[15px] sm:text-[16px] font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              Employee Summary
            </h2>
          </div>

          <p
            className="mt-1 text-[12px] sm:text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            Overview of your employee information.
          </p>
        </div>

        {hasEmployeeRecord && (
          <span
            className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full"
            style={{
              background: "var(--primary-bg, #e0e7ff)",
              color: "var(--primary, #4f46e5)",
            }}
          >
            {employee.employeeId}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 sm:p-5">
        {/* Detail grid — fixed 2 columns since this card lives in a
            narrow sidebar slot regardless of viewport width; a
            viewport-based sm: breakpoint wouldn't reliably kick in here. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-2)" }}
              >
                <Icon size={17} style={{ color: "var(--text-secondary)" }} />
              </div>

              <div className="min-w-0">
                <p className="text-[11px] sm:text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {label}
                </p>

                <p
                  className="text-[13px] sm:text-[14px] font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                  title={value}
                >
                  {value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-5 sm:mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          {hasEmployeeRecord ? (
            <Button
              variant="outline"
              className="w-full flex items-center justify-between"
              onClick={() => navigate(`/hr/employees/${employee.id}`)}
            >
              <span>View Full Employee Profile</span>
              <ArrowRight size={16} />
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full flex items-center justify-between"
                onClick={() => navigate("/hr/employees")}
              >
                <span className="flex items-center gap-2">
                  <Users size={16} />
                  Browse Employee Directory
                </span>
                <ArrowRight size={16} />
              </Button>

              <p className="mt-2 text-[11px] sm:text-[12px]" style={{ color: "var(--text-muted)" }}>
                No HR employee record is linked to this account yet.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}