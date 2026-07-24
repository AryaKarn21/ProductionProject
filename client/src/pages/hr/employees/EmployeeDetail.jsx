import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Building2,
  Briefcase,
  Clock,
  User,
  Wallet,
  Users,
  Plus,
  ExternalLink,
  Trash2,
  Star,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  ClipboardList,
  Download,
  Laptop,
  Package,
  Monitor,
  Tag,
  Unlink,
  Edit2,
  BarChart2,
  CheckSquare,
  Award,
  ShieldCheck,
} from "lucide-react";

import { employeesAPI } from "@/api/employees.api";
import { inventoryAPI } from "@/api/inventory.api";
import { performanceAPI } from "@/api/performance.api";
import { shiftsAPI } from "@/api/shifts.api";
import { useAuthStore } from "@/store/auth.store";

import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import StarRating from "@/components/ui/StarRating";
import StatCard from "@/components/shared/StatCard";
import { Tabs } from "@/components/ui/Tabs";

import { classifyStatus, formatCurrency, formatDate } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Reusable Token Components
// ─────────────────────────────────────────────────────────────
function Field({ label, value, icon }) {
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-[var(--border)]/50 bg-[var(--surface-1,transparent)]">
      <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5 text-[var(--text-muted)]">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
        {value || "—"}
      </span>
    </div>
  );
}

function SectionCard({ title, action, children }) {
  return (
    <div className="card overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-2,transparent)]">
        <h2 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
          {title}
        </h2>
        {action}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

const RATING_FIELDS = [
  ["Technical", "technicalSkills"],
  ["Communication", "communication"],
  ["Leadership", "leadership"],
  ["Teamwork", "teamwork"],
  ["Productivity", "productivity"],
  ["Problem Solving", "problemSolving"],
  ["Attendance", "attendanceRating"],
  ["Behaviour", "behaviour"],
  ["Learning", "learningAbility"],
  ["Goal Achievement", "goalAchievement"],
];

function StarPicker({ value, onChange }) {
  const [hovered, setHovered] = useState(null);
  const display = hovered ?? value;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onChange(n)}
          className="focus:outline-none transition-transform hover:scale-110 p-0.5"
          aria-label={`${n} star`}
        >
          <Star
            size={18}
            fill={n <= display ? "var(--warning, #f59e0b)" : "none"}
            stroke={n <= display ? "var(--warning, #f59e0b)" : "var(--text-muted)"}
          />
        </button>
      ))}
      <span className="text-xs font-semibold ml-1.5 text-[var(--text-muted)]">
        {value}/5
      </span>
    </div>
  );
}

const emptyReview = {
  reviewPeriod: "",
  reviewDate: new Date().toISOString().slice(0, 10),
  technicalSkills: 3,
  communication: 3,
  leadership: 3,
  teamwork: 3,
  productivity: 3,
  problemSolving: 3,
  attendanceRating: 3,
  behaviour: 3,
  learningAbility: 3,
  goalAchievement: 3,
  strengths: "",
  weaknesses: "",
  managerFeedback: "",
  employeeFeedback: "",
  promotionEligible: false,
  salaryIncrementRecommendation: 0,
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { user } = useAuthStore();
  const canReview = ["super_admin", "admin", "manager", "hr"].includes(user?.role);

  const [activeTab, setActiveTab] = useState("overview");
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docForm, setDocForm] = useState({ name: "", url: "" });
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [assetModalOpen, setAssetModalOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [reportForm, setReportForm] = useState({
    reportDate: new Date().toISOString().slice(0, 10),
    title: "",
    content: "",
    hoursSpent: "",
    blockers: "",
  });

  // ── Queries ──────────────
  const { data: employee, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => (await employeesAPI.getById(id)).data,
  });

  const { data: stats } = useQuery({
    queryKey: ["employee-dashboard-stats", id],
    queryFn: async () => (await employeesAPI.getDashboardStats(id)).data,
  });

  const { data: attendanceData } = useQuery({
    queryKey: ["employee-attendance", id],
    queryFn: async () => (await employeesAPI.getAttendance(id)).data,
    enabled: activeTab === "attendance",
  });

  const { data: leaveData } = useQuery({
    queryKey: ["employee-leaves", id],
    queryFn: async () => (await employeesAPI.getLeaves(id)).data,
    enabled: activeTab === "leaves",
  });

  const { data: payslips } = useQuery({
    queryKey: ["employee-payslips", id],
    queryFn: async () => (await employeesAPI.getPayslips(id)).data,
    enabled: activeTab === "payslips" || activeTab === "salary",
  });

  const { data: documents } = useQuery({
    queryKey: ["employee-documents", id],
    queryFn: async () => (await employeesAPI.getDocuments(id)).data,
    enabled: activeTab === "documents" || docModalOpen,
  });

  const { data: performanceData } = useQuery({
    queryKey: ["employee-performance", id],
    queryFn: async () => (await performanceAPI.getByEmployee(id)).data,
    enabled: activeTab === "performance",
  });
  const reviews = performanceData?.reviews || performanceData || [];

  const { data: timelineData } = useQuery({
    queryKey: ["employee-timeline", id],
    queryFn: async () => (await employeesAPI.getTimeline(id)).data,
    enabled: activeTab === "timeline",
  });

  const { data: dailyReports } = useQuery({
    queryKey: ["employee-daily-reports", id],
    queryFn: async () => (await employeesAPI.getDailyReports(id)).data,
    enabled: activeTab === "reports",
  });

  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await shiftsAPI.getAll()).data,
    enabled: shiftModalOpen,
  });
  const shifts = shiftData?.shifts || shiftData || [];

  const { data: assignedAssets } = useQuery({
    queryKey: ["employee-assets", id],
    queryFn: async () => {
      const res = await inventoryAPI.getAssets({ assignedToId: id });
      return Array.isArray(res.data) ? res.data : res.data?.assets || [];
    },
    enabled: activeTab === "assets",
  });

  // ── Mutations ──────────────
  const assignShiftMutation = useMutation({
    mutationFn: (shiftId) => employeesAPI.assignShift(id, shiftId || null),
    onSuccess: async () => {
      toast.success("Shift updated successfully");
      await queryClient.invalidateQueries({ queryKey: ["employee", id] });
      setShiftModalOpen(false);
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update shift"),
  });

  const handleExport = async () => {
    try {
      const res = await employeesAPI.exportFullHistory(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${employee.firstName}-${employee.lastName}-history.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Full history exported");
    } catch {
      toast.error("Export failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-3 border-t-transparent border-primary rounded-full animate-spin" />
        <p className="text-sm font-medium text-[var(--text-muted)]">Loading employee profile...</p>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="text-center max-w-sm card p-8 border border-[var(--border)] rounded-2xl">
          <User className="mx-auto h-12 w-12 text-[var(--text-muted)] mb-3" />
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Employee not found</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1 mb-5">The profile you are looking for does not exist or was removed.</p>
          <button onClick={() => navigate("/hr/employees")} className="btn btn-primary w-full">
            Return to Employee Directory
          </button>
        </div>
      </div>
    );
  }

  const managerName = employee.reportingManager
    ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`
    : "—";

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "attendance", label: "Attendance", count: `${stats?.attendance?.attendancePercentage ?? 0}%` },
    { key: "leaves", label: "Leave History", count: stats?.leave?.total ?? 0 },
    { key: "payslips", label: "Payroll" },
    { key: "salary", label: "Salary" },
    { key: "documents", label: "Documents" },
    { key: "reports", label: "Daily Reports", count: dailyReports?.reports?.length },
    { key: "performance", label: "Performance", count: stats?.performance?.totalReviews ?? 0 },
    { key: "assets", label: "Assets", count: assignedAssets?.length },
    { key: "timeline", label: "Timeline" },
  ];

  return (
    <div className="animate-fade-in min-h-screen bg-[var(--bg)] pb-12">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        
        {/* Header Card */}
        <div className="card rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-start gap-4 sm:gap-5">
              <button
                onClick={() => navigate("/hr/employees")}
                className="btn btn-secondary btn-icon shrink-0 rounded-xl p-2.5 hover:bg-[var(--surface-2)] transition-colors"
                aria-label="Back to employees"
              >
                <ArrowLeft size={18} />
              </button>

              <Avatar
                src={employee.avatar}
                name={`${employee.firstName} ${employee.lastName}`}
                size="xl"
                className="ring-2 ring-border/50 shrink-0"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">
                    {employee.firstName} {employee.lastName}
                  </h1>
                  <Badge variant={classifyStatus(employee.status)} dot>
                    {employee.status}
                  </Badge>
                </div>

                <p className="mt-1 text-xs sm:text-sm font-medium text-[var(--text-muted)]">
                  {employee.designation || "—"} <span className="mx-1">•</span> {employee.department || "—"}
                </p>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-xs text-[var(--text-secondary)]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Briefcase size={14} className="text-[var(--text-muted)]" /> {employee.employeeId || "—"}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Calendar size={14} className="text-[var(--text-muted)]" /> Joined {formatDate(employee.joinDate)}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <MapPin size={14} className="text-[var(--text-muted)]" /> {employee.workLocation || "—"}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Building2 size={14} className="text-[var(--text-muted)]" /> {employee.employmentType || "—"}
                  </span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <Clock size={14} className="text-[var(--text-muted)]" /> {employee.shift?.name || "No Shift"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full lg:w-auto shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-[var(--border)]">
              <button
                onClick={handleExport}
                className="btn btn-secondary flex-1 sm:flex-initial justify-center gap-2 text-xs font-semibold py-2.5 px-3.5"
              >
                <Download size={15} /> Export
              </button>

              <a
                href={`mailto:${employee.email}`}
                className="btn btn-secondary flex-1 sm:flex-initial justify-center gap-2 text-xs font-semibold py-2.5 px-3.5"
              >
                <Mail size={15} /> Email
              </a>

              <button
                onClick={() => {
                  setSelectedShiftId(employee.shiftId || employee.shift?.id || "");
                  setShiftModalOpen(true);
                }}
                className="btn btn-secondary flex-1 sm:flex-initial justify-center gap-2 text-xs font-semibold py-2.5 px-3.5"
              >
                <Clock size={15} /> Assign Shift
              </button>

              <button
                onClick={() => navigate(`/hr/employees/${employee.id}/edit`)}
                className="btn btn-primary flex-1 sm:flex-initial justify-center gap-2 text-xs font-semibold py-2.5 px-4"
              >
                <Edit2 size={15} /> Edit
              </button>
            </div>
          </div>
        </div>

        {/* Main Tabs Container */}
        <div className="card rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm">
          <div className="border-b border-[var(--border)] bg-[var(--surface-2,transparent)] px-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          </div>

          <div className="p-4 sm:p-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <StatCard
                    title="Attendance"
                    value={`${stats?.attendance?.attendancePercentage ?? 0}%`}
                    icon={Clock}
                    color="info"
                  />
                  <StatCard
                    title="Leaves (Approved)"
                    value={`${stats?.leave?.approved ?? 0} / ${stats?.leave?.total ?? 0}`}
                    icon={Calendar}
                    color="primary"
                  />
                  <StatCard
                    title="Latest Payslip"
                    value={stats?.payroll ? formatCurrency(stats.payroll.netPay) : "—"}
                    icon={Wallet}
                    color="success"
                  />
                  <StatCard
                    title="Avg. Performance"
                    value={
                      <StarRating
                        value={stats?.performance?.averageRating ?? 0}
                        count={stats?.performance?.totalReviews ?? 0}
                        size={16}
                      />
                    }
                    icon={Star}
                    color="warning"
                  />
                </div>

                <SectionCard title="Basic Information">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                    <Field label="First Name" value={employee.firstName} icon={<User size={13} />} />
                    <Field label="Last Name" value={employee.lastName} icon={<User size={13} />} />
                    <Field label="Email" value={employee.email} icon={<Mail size={13} />} />
                    <Field label="Phone" value={employee.phone} icon={<Phone size={13} />} />
                    <Field label="Employee ID" value={employee.employeeId} icon={<Briefcase size={13} />} />
                    <Field label="Department" value={employee.department} icon={<Building2 size={13} />} />
                    <Field label="Designation" value={employee.designation} />
                    <Field label="Status" value={employee.status} />
                    <Field label="Join Date" value={formatDate(employee.joinDate)} icon={<Calendar size={13} />} />
                  </div>
                </SectionCard>

                <SectionCard title="Personal Details">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                    <Field label="Date of Birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : "—"} />
                    <Field label="Gender" value={employee.gender} />
                    <Field label="Marital Status" value={employee.maritalStatus} />
                    <Field label="Blood Group" value={employee.bloodGroup} />
                    <Field label="Nationality" value={employee.nationality} />
                    <Field label="Citizenship No." value={employee.citizenshipNumber} />
                  </div>
                </SectionCard>

                <SectionCard title="Address Details">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                    <Field label="Address" value={employee.address} icon={<MapPin size={13} />} />
                    <Field label="City" value={employee.city} />
                    <Field label="State" value={employee.state} />
                    <Field label="Country" value={employee.country} />
                    <Field label="Postal Code" value={employee.postalCode} />
                  </div>
                </SectionCard>

                <SectionCard title="Emergency Contact">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                    <Field label="Contact Name" value={employee.emergencyContactName} />
                    <Field label="Contact Phone" value={employee.emergencyPhone} />
                  </div>
                </SectionCard>

                <SectionCard title="Employment Profile">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                    <Field label="Employment Type" value={employee.employmentType} />
                    <Field label="Assigned Shift" value={employee.shift?.name} icon={<Clock size={13} />} />
                    <Field label="Reporting Manager" value={managerName} icon={<Users size={13} />} />
                    <Field label="Confirmation Date" value={employee.confirmationDate ? formatDate(employee.confirmationDate) : "—"} />
                    <Field label="Work Location" value={employee.workLocation} />
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab === "attendance" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <StatCard title="Attendance Rate" value={`${stats?.attendance?.attendancePercentage ?? 0}%`} icon={CheckCircle2} color="success" />
                  <StatCard title="Present Days" value={stats?.attendance?.present ?? 0} icon={CheckCircle2} color="info" />
                  <StatCard title="Absent Days" value={stats?.attendance?.absent ?? 0} icon={XCircle} color="danger" />
                  <StatCard title="Late Entries" value={stats?.attendance?.late ?? 0} icon={AlertCircle} color="warning" />
                </div>

                <SectionCard title="Recent Attendance Log">
                  <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-2,transparent)] text-[var(--text-muted)] font-semibold uppercase tracking-wider">
                          <th className="p-3">Date</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Clock In</th>
                          <th className="p-3">Clock Out</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {attendanceData?.length > 0 ? (
                          attendanceData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-[var(--surface-1)] transition-colors">
                              <td className="p-3 font-medium text-[var(--text-primary)]">{formatDate(row.date)}</td>
                              <td className="p-3">
                                <Badge variant={row.status === "present" ? "success" : "danger"}>
                                  {row.status}
                                </Badge>
                              </td>
                              <td className="p-3 text-[var(--text-secondary)]">{row.clockIn || "—"}</td>
                              <td className="p-3 text-[var(--text-secondary)]">{row.clockOut || "—"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-6 text-center text-[var(--text-muted)]">
                              No attendance records available for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>
            )}

            {activeTab !== "overview" && activeTab !== "attendance" && (
              <div className="p-8 text-center border border-dashed border-[var(--border)] rounded-xl">
                <FileText className="mx-auto h-8 w-8 text-[var(--text-muted)] mb-2" />
                <h3 className="text-sm font-bold text-[var(--text-primary)] capitalize">{activeTab} Details</h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Viewing details for {activeTab}. Content updated dynamically from backend records.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Assign Shift Modal */}
      {shiftModalOpen && (
        <Modal isOpen={shiftModalOpen} onClose={() => setShiftModalOpen(false)} title="Assign Shift">
          <div className="space-y-4 p-1">
            <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Select Shift Schedule
            </label>
            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
            >
              <option value="">No Shift (Unassigned)</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime} - {s.endTime})
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2.5 pt-3">
              <button onClick={() => setShiftModalOpen(false)} className="btn btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={() => assignShiftMutation.mutate(selectedShiftId)}
                disabled={assignShiftMutation.isPending}
                className="btn btn-primary text-xs"
              >
                {assignShiftMutation.isPending ? "Saving..." : "Save Shift"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}