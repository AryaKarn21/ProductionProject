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
// Small building blocks (token-based, consistent with the CRM)
// ─────────────────────────────────────────────────────────────
function Field({ label, value, icon }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[11px] font-medium uppercase tracking-wide flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        {icon}
        {label}
      </span>
      <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

function SectionCard({ title, action, children }) {
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// Human-friendly labels + token colors for the audit-log timeline
const TIMELINE_LABELS = {
  employee_created: { label: "Employee Created", color: "var(--success)" },
  employee_updated: { label: "Profile Updated", color: "var(--info)" },
  employee_status_changed: { label: "Status Changed", color: "#7c3aed" },
  department_changed: { label: "Department Changed", color: "#4f46e5" },
  salary_updated: { label: "Salary Updated", color: "var(--success)" },
  shift_assigned: { label: "Shift Assigned", color: "#0891b2" },
  manager_assigned: { label: "Reporting Manager Changed", color: "#0d9488" },
  performance_review_created: { label: "Performance Review Submitted", color: "var(--warning)" },
  promotion: { label: "Promotion", color: "#db2777" },
  document_uploaded: { label: "Document Added", color: "#475569" },
  daily_report_submitted: { label: "Daily Report Submitted", color: "#2563eb" },
  payroll_generated: { label: "Payroll Generated", color: "var(--success)" },
  leave_approved: { label: "Leave Approved", color: "var(--success)" },
  employee_deleted: { label: "Employee Removed", color: "var(--danger)" },
};

function describeChanges(action, changes) {
  if (!changes) return null;
  switch (action) {
    case "department_changed":
      return `${changes.from || "—"} → ${changes.to || "—"}`;
    case "salary_updated":
      return `${formatCurrency(changes.from)} → ${formatCurrency(changes.to)}`;
    case "employee_status_changed":
      return `${changes.from || "—"} → ${changes.to || "—"}`;
    case "shift_assigned":
      return changes.shiftName || null;
    case "manager_assigned":
      return changes.managerName || "Removed";
    case "performance_review_created":
      return `${changes.reviewPeriod || ""}${changes.overallRating != null ? ` · Rating ${changes.overallRating}/5` : ""
        }`;
    case "document_uploaded":
      return changes.name || null;
    case "daily_report_submitted":
      return `${changes.title || "Daily report"}${changes.hoursSpent ? ` · ${changes.hoursSpent}h` : ""}`;
    default:
      return null;
  }
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

// ── Interactive star picker (1–5) ────────────────────────────
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
          className="focus:outline-none transition-transform hover:scale-110"
          aria-label={`${n} star`}
        >
          <Star
            size={20}
            fill={n <= display ? "var(--warning, #f59e0b)" : "none"}
            stroke={n <= display ? "var(--warning, #f59e0b)" : "var(--text-muted)"}
          />
        </button>
      ))}
      <span className="text-[12px] font-semibold ml-1" style={{ color: "var(--text-muted)" }}>
        {value}/5
      </span>
    </div>
  );
}

function ReviewNote({ label, text }) {
  if (!text) return null;
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-2)" }}>
      <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-[13px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
        {text}
      </p>
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
  const [editingReviewId, setEditingReviewId] = useState(null); // null = create, string = edit
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

  // ── Queries ──────────────────────────────────────────────
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
    enabled: activeTab === "payslips",
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

  const createReviewMutation = useMutation({
    mutationFn: (data) => performanceAPI.create({ ...data, employeeId: id, reviewerEmployeeId: id }),
    onSuccess: () => {
      toast.success("Review submitted");
      queryClient.invalidateQueries({ queryKey: ["employee-performance", id] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard-stats", id] });
      setReviewModalOpen(false);
      setEditingReviewId(null);
      setReviewForm(emptyReview);
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to submit review"),
  });

  const updateReviewMutation = useMutation({
    mutationFn: ({ reviewId, data }) => performanceAPI.update(reviewId, data),
    onSuccess: () => {
      toast.success("Review updated");
      queryClient.invalidateQueries({ queryKey: ["employee-performance", id] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard-stats", id] });
      setReviewModalOpen(false);
      setEditingReviewId(null);
      setReviewForm(emptyReview);
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update review"),
  });

  const deleteReviewMutation = useMutation({
    mutationFn: (reviewId) => performanceAPI.delete(reviewId),
    onSuccess: () => {
      toast.success("Review deleted");
      queryClient.invalidateQueries({ queryKey: ["employee-performance", id] });
      queryClient.invalidateQueries({ queryKey: ["employee-dashboard-stats", id] });
      setDeleteConfirmId(null);
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to delete review"),
  });

  const openCreateReview = () => {
    setEditingReviewId(null);
    setReviewForm(emptyReview);
    setReviewModalOpen(true);
  };

  const openEditReview = (review) => {
    setEditingReviewId(review.id);
    setReviewForm({
      reviewPeriod: review.reviewPeriod || "",
      reviewDate: review.reviewDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      technicalSkills: review.technicalSkills ?? 3,
      communication: review.communication ?? 3,
      leadership: review.leadership ?? 3,
      teamwork: review.teamwork ?? 3,
      productivity: review.productivity ?? 3,
      problemSolving: review.problemSolving ?? 3,
      attendanceRating: review.attendanceRating ?? 3,
      behaviour: review.behaviour ?? 3,
      learningAbility: review.learningAbility ?? 3,
      goalAchievement: review.goalAchievement ?? 3,
      strengths: review.strengths || "",
      weaknesses: review.weaknesses || "",
      managerFeedback: review.managerFeedback || "",
      employeeFeedback: review.employeeFeedback || "",
      promotionEligible: review.promotionEligible || false,
      salaryIncrementRecommendation: review.salaryIncrementRecommendation || 0,
    });
    setReviewModalOpen(true);
  };

  const handleReviewSubmit = () => {
    if (!reviewForm.reviewPeriod.trim()) {
      toast.error("Review period is required (e.g. Q1 2026)");
      return;
    }
    if (editingReviewId) {
      updateReviewMutation.mutate({ reviewId: editingReviewId, data: reviewForm });
    } else {
      createReviewMutation.mutate(reviewForm);
    }
  };

  const setRating = (field, val) =>
    setReviewForm((prev) => ({ ...prev, [field]: val }));

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

  // ── Mutations ────────────────────────────────────────────
  const addDocument = useMutation({
    mutationFn: (data) => employeesAPI.addDocument(id, data),
    onSuccess: () => {
      toast.success("Document added");
      queryClient.invalidateQueries({ queryKey: ["employee-documents", id] });
      queryClient.invalidateQueries({ queryKey: ["employee-timeline", id] });
      setDocModalOpen(false);
      setDocForm({ name: "", url: "" });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to add document"),
  });

  const deleteDocument = useMutation({
    mutationFn: (docId) => employeesAPI.deleteDocument(id, docId),
    onSuccess: () => {
      toast.success("Document removed");
      queryClient.invalidateQueries({ queryKey: ["employee-documents", id] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to remove document"),
  });

  const { data: shiftData } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => (await shiftsAPI.getAll()).data,
    enabled: shiftModalOpen,
  });
  const shifts = shiftData?.shifts || shiftData || [];

  const assignShiftMutation = useMutation({
    mutationFn: (shiftId) => employeesAPI.assignShift(id, shiftId || null),
    onSuccess: async () => {
      toast.success("Shift updated");
      await queryClient.invalidateQueries({ queryKey: ["employee", id] });
      await queryClient.refetchQueries({ queryKey: ["employee", id] });
      queryClient.invalidateQueries({ queryKey: ["employee-timeline", id] });
      setShiftModalOpen(false);
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to update shift"),
  });

  // ── Assets ───────────────────────────────────────────────
  const { data: assignedAssets } = useQuery({
    queryKey: ["employee-assets", id],
    queryFn: async () => {
      const res = await inventoryAPI.getAssets({ assignedToId: id });
      return Array.isArray(res.data) ? res.data : res.data?.assets || [];
    },
    enabled: activeTab === "assets",
  });

  const { data: availableAssetsData } = useQuery({
    queryKey: ["available-assets"],
    queryFn: async () => {
      const res = await inventoryAPI.getAssets({ status: "available" });
      return Array.isArray(res.data) ? res.data : res.data?.assets || [];
    },
    enabled: assetModalOpen,
  });
  const availableAssets = availableAssetsData || [];

  const assignAssetMutation = useMutation({
    mutationFn: (assetId) =>
      inventoryAPI.updateAsset(assetId, { assignedToId: id, status: "assigned" }),
    onSuccess: () => {
      toast.success("Asset assigned");
      queryClient.invalidateQueries({ queryKey: ["employee-assets", id] });
      queryClient.invalidateQueries({ queryKey: ["available-assets"] });
      setAssetModalOpen(false);
      setSelectedAssetId("");
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to assign asset"),
  });

  const unassignAssetMutation = useMutation({
    mutationFn: (assetId) =>
      inventoryAPI.updateAsset(assetId, { assignedToId: null, status: "available" }),
    onSuccess: () => {
      toast.success("Asset unassigned");
      queryClient.invalidateQueries({ queryKey: ["employee-assets", id] });
      queryClient.invalidateQueries({ queryKey: ["available-assets"] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to unassign asset"),
  });

  // const createReview = useMutation({
  //   mutationFn: (data) => performanceAPI.create({ ...data, employeeId: id }),
  //   onSuccess: () => {
  //     toast.success("Performance review added");
  //     queryClient.invalidateQueries({ queryKey: ["employee-performance", id] });
  //     queryClient.invalidateQueries({ queryKey: ["employee-dashboard-stats", id] });
  //     queryClient.invalidateQueries({ queryKey: ["employee-timeline", id] });
  //     setReviewModalOpen(false);
  //     setReviewForm(emptyReview);
  //   },
  //   onError: (err) => toast.error(err?.response?.data?.message || "Failed to add review"),
  // });

  const addReport = useMutation({
    mutationFn: (data) => employeesAPI.addDailyReport(id, data),
    onSuccess: () => {
      toast.success("Daily report submitted");
      queryClient.invalidateQueries({ queryKey: ["employee-daily-reports", id] });
      queryClient.invalidateQueries({ queryKey: ["employee-timeline", id] });
      setReportForm({
        reportDate: new Date().toISOString().slice(0, 10),
        title: "",
        content: "",
        hoursSpent: "",
        blockers: "",
      });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to submit report"),
  });

  const deleteReport = useMutation({
    mutationFn: (reportId) => employeesAPI.deleteDailyReport(id, reportId),
    onSuccess: () => {
      toast.success("Report removed");
      queryClient.invalidateQueries({ queryKey: ["employee-daily-reports", id] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to remove report"),
  });

  // ── Full-history CSV export ───────────────────────────────
  const handleExport = async () => {
    try {
      const res = await employeesAPI.exportFullHistory(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${employee.firstName}-${employee.lastName}-full-history.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Full history exported");
    } catch {
      toast.error("Export failed");
    }
  };

  // ── Loading / not-found ──────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <div
            className="w-10 h-10 border-4 rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }}
          />
          <p style={{ color: "var(--text-muted)" }}>Loading employee details…</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="text-center">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Employee not found
          </h2>
          <button onClick={() => navigate("/hr/employees")} className="btn btn-primary mt-5">
            Back to Employees
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
    { key: "assets", label: "Assets", count: assignedAssets?.length ?? undefined },
    { key: "timeline", label: "Timeline" },
  ];

  const timeInput = (val) =>
    val ? new Date(val).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="animate-fade-in" style={{ background: "var(--bg)" }}>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* ================= HEADER ================= */}
        <div className="card">
          <div className="p-4 sm:p-6">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 sm:gap-6">
              <div className="flex items-start gap-3 sm:gap-5">
                <button
                  onClick={() => navigate("/hr/employees")}
                  className="btn btn-secondary btn-icon shrink-0"
                  aria-label="Back to employees"
                >
                  <ArrowLeft size={18} />
                </button>

                <Avatar
                  src={employee.avatar}
                  name={`${employee.firstName} ${employee.lastName}`}
                  size="xl"
                />

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-xl sm:text-2xl xl:text-[26px] font-bold break-words" style={{ color: "var(--text-primary)" }}>
                      {employee.firstName} {employee.lastName}
                    </h1>
                    <Badge variant={classifyStatus(employee.status)} dot>
                      {employee.status}
                    </Badge>
                  </div>

                  <p className="mt-1 text-[12px] sm:text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {employee.designation || "—"} • {employee.department || "—"}
                  </p>

                  <div
                    className="flex flex-wrap gap-x-4 sm:gap-x-6 gap-y-2 mt-3 sm:mt-4 text-[12px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Briefcase size={14} /> {employee.employeeId || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} /> Joined {formatDate(employee.joinDate)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} /> {employee.workLocation || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Building2 size={14} /> {employee.employmentType || "—"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} /> {employee.shift?.name || "No shift assigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Buttons: grid layout */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 w-full xl:w-auto">
                <button
                  onClick={handleExport}
                  className="btn btn-secondary flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Export History
                </button>

                <button
                  type="button"
                  disabled={!employee.email}
                  title={
                    employee.email
                      ? undefined
                      : "This employee has no email on file"
                  }
                  onClick={() =>
                    navigate(
                      `/email/compose?to=${encodeURIComponent(
                        employee.email
                      )}&subject=${encodeURIComponent(
                        `Regarding ${employee.firstName
                          ? `${employee.firstName} ${employee.lastName || ""}`.trim()
                          : "your profile"
                        }`
                      )}`
                    )
                  }
                  className="btn btn-secondary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Mail size={16} /> Send Email
                </button>
                <button
                  onClick={() => {
                    setSelectedShiftId(employee.shiftId || employee.shift?.id || "");
                    setShiftModalOpen(true);
                  }}
                  className="btn btn-secondary flex items-center justify-center gap-2"
                >
                  <Clock size={16} /> Assign Shift
                </button>
                <button
                  onClick={() => navigate(`/hr/employees/${employee.id}/edit`)}
                  className="btn btn-primary flex items-center justify-center gap-2">
                  <Edit2 size={16} /> Edit Employee
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ================= MAIN CONTENT ================= */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 sm:gap-6">
          {/* ================= LEFT ================= */}
          <div className="xl:col-span-3">
            <div className="card">
              <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

              <div className="p-4 sm:p-6">
                {/* ================= OVERVIEW ================= */}
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
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

                    <SectionCard title="Personal Information">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
                        <Field label="Date of Birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : "—"} />
                        <Field label="Gender" value={employee.gender} />
                        <Field label="Marital Status" value={employee.maritalStatus} />
                        <Field label="Blood Group" value={employee.bloodGroup} />
                        <Field label="Nationality" value={employee.nationality} />
                        <Field label="Citizenship Number" value={employee.citizenshipNumber} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Address">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
                        <Field label="Address" value={employee.address} icon={<MapPin size={13} />} />
                        <Field label="City" value={employee.city} />
                        <Field label="State" value={employee.state} />
                        <Field label="Country" value={employee.country} />
                        <Field label="Postal Code" value={employee.postalCode} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Emergency Contact">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
                        <Field label="Contact Name" value={employee.emergencyContactName} />
                        <Field label="Contact Phone" value={employee.emergencyPhone} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Employment">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
                        <Field label="Employment Type" value={employee.employmentType} />
                        <Field label="Shift" value={employee.shift?.name} icon={<Clock size={13} />} />
                        <Field label="Reporting Manager" value={managerName} icon={<Users size={13} />} />
                        <Field label="Confirmation Date" value={employee.confirmationDate ? formatDate(employee.confirmationDate) : "—"} />
                        <Field label="Work Location" value={employee.workLocation} />
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ================= ATTENDANCE ================= */}
                {activeTab === "attendance" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <StatCard title="Attendance %" value={`${stats?.attendance?.attendancePercentage ?? 0}%`} icon={CheckCircle2} color="success" />
                      <StatCard title="Present Days" value={stats?.attendance?.present ?? 0} icon={CheckCircle2} color="info" />
                      <StatCard title="Absent Days" value={stats?.attendance?.absent ?? 0} icon={XCircle} color="danger" />
                      <StatCard title="Late Entries" value={stats?.attendance?.late ?? 0} icon={AlertCircle} color="warning" />
                    </div>
                    <p className="text-[11px] -mt-3" style={{ color: "var(--text-muted)" }}>
                      Summary figures reflect the current calendar month.
                    </p>

                    <SectionCard title="Attendance History (last 30 records)">
                      <div className="overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Check In</th>
                              <th>Check Out</th>
                              <th>Hours</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(attendanceData?.attendance || []).length ? (
                              attendanceData.attendance.map((r) => (
                                <tr key={r.id}>
                                  <td>{formatDate(r.date)}</td>
                                  <td>{timeInput(r.checkIn)}</td>
                                  <td>{timeInput(r.checkOut)}</td>
                                  <td>{r.hoursWorked ?? "—"}</td>
                                  <td>
                                    <Badge variant={classifyStatus(r.status)}>{r.status}</Badge>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                                  No attendance records found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ================= LEAVE HISTORY ================= */}
                {activeTab === "leaves" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                      <StatCard title="Total Leaves" value={stats?.leave?.total ?? 0} icon={Calendar} color="primary" />
                      <StatCard title="Approved" value={stats?.leave?.approved ?? 0} icon={CheckCircle2} color="success" />
                      <StatCard title="Pending" value={stats?.leave?.pending ?? 0} icon={AlertCircle} color="warning" />
                      <StatCard title="Rejected" value={stats?.leave?.rejected ?? 0} icon={XCircle} color="danger" />
                    </div>
                    {/* Leave trend chart removed */}

                    <SectionCard title="Leave History">
                      <div className="overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Leave Type</th>
                              <th>Start</th>
                              <th>End</th>
                              <th>Days</th>
                              <th>Status</th>
                              <th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(leaveData?.leaves || []).length ? (
                              leaveData.leaves.map((l) => (
                                <tr key={l.id}>
                                  <td className="font-medium" style={{ color: "var(--text-primary)" }}>{l.leaveType}</td>
                                  <td>{formatDate(l.startDate)}</td>
                                  <td>{formatDate(l.endDate)}</td>
                                  <td>{l.days}</td>
                                  <td>
                                    <Badge variant={classifyStatus(l.status)}>{l.status}</Badge>
                                  </td>
                                  <td className="max-w-xs truncate" title={l.reason}>{l.reason}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                                  No leave history found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </SectionCard>
                  </div>
                )}

                {/* ================= PAYROLL ================= */}
                {activeTab === "payslips" && (
                  <div className="space-y-4">
                    {(payslips || []).length ? (
                      payslips.map((pay) => (
                        <div key={pay.id} className="card p-5">
                          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                            <div className="min-w-[180px]">
                              <h3 className="font-semibold text-[15px]" style={{ color: "var(--text-primary)" }}>
                                {pay.period}
                              </h3>
                              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                                {pay.processedAt ? `Processed ${formatDate(pay.processedAt)}` : "Not yet processed"}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-5 flex-1">
                              <div>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Basic</p>
                                <h4 className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{formatCurrency(pay.basicSalary)}</h4>
                              </div>
                              <div>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Allowances</p>
                                <h4 className="font-semibold text-[13px]" style={{ color: "var(--text-primary)" }}>{formatCurrency(pay.allowances)}</h4>
                              </div>
                              <div>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Tax</p>
                                <h4 className="font-semibold text-[13px]" style={{ color: "var(--danger)" }}>{formatCurrency(pay.tax)}</h4>
                              </div>
                              <div>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Deductions</p>
                                <h4 className="font-semibold text-[13px]" style={{ color: "var(--danger)" }}>{formatCurrency(pay.deductions)}</h4>
                              </div>
                              <div>
                                <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Net Pay</p>
                                <h4 className="font-bold text-[13px]" style={{ color: "var(--success)" }}>{formatCurrency(pay.netPay)}</h4>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="card p-10 text-center" style={{ color: "var(--text-muted)" }}>
                        No payroll records available.
                      </div>
                    )}
                  </div>
                )}

                {/* ================= SALARY ================= */}
                {activeTab === "salary" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                      <StatCard title={`Basic (${employee.salaryType || "Monthly"})`} value={formatCurrency(employee.salary)} icon={Wallet} color="primary" />
                      <StatCard title="Allowances" value={formatCurrency(employee.allowances || 0)} icon={Wallet} color="info" />
                      <StatCard title="Bonus" value={formatCurrency(employee.bonus || 0)} icon={Wallet} color="success" />
                      <StatCard title="Overtime" value={formatCurrency(employee.overtime || 0)} icon={Clock} color="warning" />
                      <StatCard title="Tax" value={formatCurrency(employee.tax || 0)} icon={Wallet} color="danger" />
                      <StatCard title="Provident Fund" value={formatCurrency(employee.pf || 0)} icon={Wallet} color="gray" />
                      <StatCard title="Insurance" value={formatCurrency(employee.insurance || 0)} icon={Wallet} color="gray" />
                      <StatCard title="Effective Since" value={employee.salaryEffectiveDate ? formatDate(employee.salaryEffectiveDate) : "—"} icon={Calendar} color="info" />
                    </div>

                    <SectionCard title="Bank & Payment Details">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
                        <Field label="Bank Name" value={employee.bankName} />
                        <Field label="Account Holder" value={employee.accountHolderName} />
                        <Field label="Account Number" value={employee.bankAccountNumber} />
                        <Field label="IFSC / SWIFT" value={employee.ifscSwiftCode} />
                        <Field label="Payment Method" value={employee.paymentMethod} />
                        <Field label="Currency" value={employee.currency} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Government / Tax Identifiers">
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 p-4 sm:p-6">
                        <Field label="PAN / Tax Number" value={employee.panTaxNumber} />
                        <Field label="PF Number" value={employee.pfNumber} />
                        <Field label="ESI Number" value={employee.esiNumber} />
                      </div>
                      {employee.salaryNotes && (
                        <div className="px-6 pb-6">
                          <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-muted)" }}>Notes</p>
                          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{employee.salaryNotes}</p>
                        </div>
                      )}
                    </SectionCard>
                  </div>
                )}

                {/* ================= DOCUMENTS ================= */}
                {activeTab === "documents" && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                          Employee Documents
                        </h2>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          Links to contracts, IDs, certificates, etc.
                        </p>
                      </div>
                      <button className="btn btn-primary flex items-center gap-2" onClick={() => setDocModalOpen(true)}>
                        <Plus size={16} /> Add Document
                      </button>
                    </div>

                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Document</th>
                              <th>Added</th>
                              <th className="text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(documents || []).length ? (
                              documents.map((doc) => (
                                <tr key={doc.id}>
                                  <td className="font-medium" style={{ color: "var(--text-primary)" }}>
                                    <span className="flex items-center gap-2">
                                      <FileText size={15} style={{ color: "var(--text-muted)" }} />
                                      {doc.name}
                                    </span>
                                  </td>
                                  <td>{doc.uploadedAt ? formatDate(doc.uploadedAt) : "—"}</td>
                                  <td>
                                    <div className="flex justify-end gap-2">
                                      <a href={doc.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm flex items-center gap-1">
                                        <ExternalLink size={13} /> Open
                                      </a>
                                      <button
                                        className="btn btn-danger btn-sm flex items-center gap-1"
                                        onClick={() => deleteDocument.mutate(doc.id)}
                                        disabled={deleteDocument.isPending}
                                      >
                                        <Trash2 size={13} /> Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={3} className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                                  No documents added yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= DAILY REPORTS ================= */}
                {activeTab === "reports" && (
                  <div className="space-y-6">
                    {/* Submit box */}
                    <SectionCard title="Submit Daily Report">
                      <div className="p-6 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Date</label>
                            <input
                              type="date"
                              className="input w-full"
                              value={reportForm.reportDate}
                              onChange={(e) => setReportForm((f) => ({ ...f, reportDate: e.target.value }))}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Title (optional)</label>
                            <input
                              type="text"
                              className="input w-full"
                              placeholder="e.g. Tuesday standup"
                              value={reportForm.title}
                              onChange={(e) => setReportForm((f) => ({ ...f, title: e.target.value }))}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>What did you work on? *</label>
                          <textarea
                            className="input w-full"
                            rows={4}
                            placeholder="Summarise the tasks you completed today…"
                            value={reportForm.content}
                            onChange={(e) => setReportForm((f) => ({ ...f, content: e.target.value }))}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Hours Spent</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              className="input w-full"
                              placeholder="8"
                              value={reportForm.hoursSpent}
                              onChange={(e) => setReportForm((f) => ({ ...f, hoursSpent: e.target.value }))}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Blockers (optional)</label>
                            <input
                              type="text"
                              className="input w-full"
                              placeholder="Anything blocking your progress?"
                              value={reportForm.blockers}
                              onChange={(e) => setReportForm((f) => ({ ...f, blockers: e.target.value }))}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            className="btn btn-primary flex items-center gap-2"
                            disabled={addReport.isPending || !reportForm.content || !reportForm.reportDate}
                            onClick={() =>
                              addReport.mutate({
                                ...reportForm,
                                hoursSpent: Number(reportForm.hoursSpent) || 0,
                              })
                            }
                          >
                            <ClipboardList size={16} />
                            {addReport.isPending ? "Submitting…" : "Submit Report"}
                          </button>
                        </div>
                      </div>
                    </SectionCard>

                    {/* History */}
                    <div className="space-y-3">
                      {(dailyReports?.reports || []).length ? (
                        dailyReports.reports.map((r) => (
                          <div key={r.id} className="card p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-[14px]" style={{ color: "var(--text-primary)" }}>
                                    {r.title || "Daily Report"}
                                  </h3>
                                  {r.hoursSpent ? <Badge variant="info">{r.hoursSpent}h</Badge> : null}
                                </div>
                                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                  {formatDate(r.reportDate)}
                                </p>
                              </div>
                              <button
                                className="btn btn-ghost btn-sm text-red-500"
                                onClick={() => deleteReport.mutate(r.id)}
                                disabled={deleteReport.isPending}
                                aria-label="Delete report"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            <p className="text-[13px] mt-3 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                              {r.content}
                            </p>
                            {r.blockers && (
                              <p className="text-[12px] mt-2" style={{ color: "var(--danger)" }}>
                                <strong>Blockers:</strong> {r.blockers}
                              </p>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="card p-10 text-center" style={{ color: "var(--text-muted)" }}>
                          No daily reports submitted yet.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ================= PERFORMANCE ================= */}
                {activeTab === "performance" && (
                  <div className="space-y-6">

                    {/* ── Header row ── */}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                          Performance Reviews
                        </h2>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {canReview
                            ? "You can add, edit, and delete reviews."
                            : "View-only — only managers, HR, and admins can submit reviews."}
                        </p>
                      </div>
                      {canReview && (
                        <button
                          className="btn btn-primary flex items-center gap-2 shrink-0"
                          onClick={openCreateReview}
                        >
                          <Plus size={15} /> New Review
                        </button>
                      )}
                    </div>

                    {/* ── Role badge ── */}
                    {canReview && (
                      <div
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px] font-medium"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        <ShieldCheck size={14} style={{ color: "var(--primary)" }} />
                        You have reviewer access as <strong className="ml-1">{user?.role?.replace("_", " ")}</strong>
                      </div>
                    )}

                    {/* ── Stat cards ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <StatCard title="Avg. Rating" value={<StarRating value={stats?.performance?.averageRating ?? 0} count={1} size={14} />} icon={Star} color="warning" />
                      <StatCard title="Total Reviews" value={reviews.length} icon={BarChart2} color="info" />
                      <StatCard title="Promotion Eligible" value={reviews.filter((r) => r.promotionEligible).length > 0 ? "Yes" : "No"} icon={Award} color={reviews.filter((r) => r.promotionEligible).length ? "success" : "default"} />
                      <StatCard title="Latest Period" value={reviews[0]?.reviewPeriod || "—"} icon={CheckSquare} color="primary" />
                    </div>

                    {/* ── Review cards ── */}
                    {reviews.length ? (
                      <div className="space-y-4">
                        {reviews.map((review) => {
                          const avg = review.overallRating ?? 0;
                          return (
                            <div key={review.id} className="card p-5 sm:p-6 space-y-4">

                              {/* Card header */}
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-bold text-[15px]" style={{ color: "var(--text-primary)" }}>
                                      {review.reviewPeriod}
                                    </h3>
                                    {review.promotionEligible && (
                                      <Badge variant="success">
                                        <Award size={10} className="inline mr-1" /> Promotion Eligible
                                      </Badge>
                                    )}
                                    <Badge variant={review.status === "acknowledged" ? "success" : review.status === "submitted" ? "info" : "default"}>
                                      {review.status}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                                    Reviewed {formatDate(review.reviewDate)}
                                    {review.reviewer
                                      ? ` · by ${review.reviewer.firstName || ""} ${review.reviewer.lastName || ""}`
                                      : ""}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  {/* Overall rating badge */}
                                  <div
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold"
                                    style={{ background: "var(--warning-bg, rgba(245,158,11,.12))", color: "var(--warning, #f59e0b)" }}
                                  >
                                    <Star size={12} fill="currentColor" />
                                    {avg.toFixed(1)} / 5
                                  </div>

                                  {/* Edit / Delete — managers / HR / admin only */}
                                  {canReview && (
                                    <div className="flex items-center gap-1">
                                      <button
                                        className="btn btn-ghost btn-sm flex items-center gap-1"
                                        onClick={() => openEditReview(review)}
                                        title="Edit review"
                                      >
                                        <Edit2 size={13} />
                                      </button>
                                      <button
                                        className="btn btn-ghost btn-sm text-red-500 flex items-center gap-1"
                                        onClick={() => setDeleteConfirmId(review.id)}
                                        title="Delete review"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Rating grid */}
                              <div
                                className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t"
                                style={{ borderColor: "var(--border)" }}
                              >
                                {RATING_FIELDS.map(([label, key]) => (
                                  <div key={key} className="text-center">
                                    <p className="text-[10px] mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
                                    <StarRating value={review[key] ?? 0} count={1} size={11} showValue={false} />
                                    <p className="text-[11px] font-bold mt-0.5" style={{ color: "var(--text-primary)" }}>
                                      {review[key] ?? 0}/5
                                    </p>
                                  </div>
                                ))}
                              </div>

                              {/* Narratives */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <ReviewNote label="Strengths" text={review.strengths} />
                                <ReviewNote label="Areas to Improve" text={review.weaknesses} />
                                <ReviewNote label="Manager Feedback" text={review.managerFeedback} />
                                <ReviewNote label="Employee Feedback" text={review.employeeFeedback} />
                              </div>

                              {review.salaryIncrementRecommendation > 0 && (
                                <div
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium"
                                  style={{ background: "var(--success-bg, rgba(22,163,74,.1))", color: "var(--success, #16a34a)" }}
                                >
                                  <TrendingUp size={13} />
                                  Recommended salary increment: <strong className="ml-1">{review.salaryIncrementRecommendation}%</strong>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="card p-14 text-center" style={{ color: "var(--text-muted)" }}>
                        <BarChart2 size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                          No performance reviews yet
                        </p>
                        <p className="text-[12px] mt-1">
                          {canReview ? 'Click "New Review" to submit the first one.' : "Reviews will appear here once submitted by a manager."}
                        </p>
                        {canReview && (
                          <button className="btn btn-primary mt-4 flex items-center gap-2 mx-auto" onClick={openCreateReview}>
                            <Plus size={14} /> Add First Review
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ================= ASSETS ================= */}
                {activeTab === "assets" && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                          Assigned Assets
                        </h2>
                        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          Laptops, monitors, and other equipment assigned to this employee.
                        </p>
                      </div>
                      <button
                        className="btn btn-primary flex items-center gap-2"
                        onClick={() => setAssetModalOpen(true)}
                      >
                        <Plus size={16} /> Assign Asset
                      </button>
                    </div>

                    {/* Summary stat */}
                    {(assignedAssets || []).length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {["laptop", "monitor", "phone", "other"].map((cat) => {
                          const count = (assignedAssets || []).filter(
                            (a) => (a.category || "other").toLowerCase() === cat
                          ).length;
                          if (count === 0) return null;
                          const Icon = cat === "laptop" ? Laptop : cat === "monitor" ? Monitor : cat === "phone" ? Phone : Package;
                          return (
                            <div
                              key={cat}
                              className="flex items-center gap-3 rounded-xl p-3 border"
                              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
                            >
                              <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--primary-10, rgba(59,130,246,.12))" }}>
                                <Icon size={15} style={{ color: "var(--primary)" }} />
                              </span>
                              <div>
                                <p className="text-[11px] capitalize" style={{ color: "var(--text-muted)" }}>{cat}</p>
                                <p className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{count}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Asset</th>
                              <th>Category</th>
                              <th>Code</th>
                              <th>Serial No.</th>
                              <th>Purchase Date</th>
                              <th>Status</th>
                              <th className="text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(assignedAssets || []).length ? (
                              assignedAssets.map((asset) => (
                                <tr key={asset.id}>
                                  <td>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                        style={{ background: "var(--surface-2)" }}
                                      >
                                        {(asset.category || "").toLowerCase() === "laptop"
                                          ? <Laptop size={13} style={{ color: "var(--primary)" }} />
                                          : (asset.category || "").toLowerCase() === "monitor"
                                            ? <Monitor size={13} style={{ color: "var(--info)" }} />
                                            : <Package size={13} style={{ color: "var(--text-muted)" }} />}
                                      </span>
                                      <span className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>
                                        {asset.name}
                                        {asset.brand ? <span className="text-[11px] ml-1" style={{ color: "var(--text-muted)" }}>({asset.brand})</span> : null}
                                      </span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="flex items-center gap-1">
                                      <Tag size={11} style={{ color: "var(--text-muted)" }} />
                                      {asset.category || "—"}
                                    </span>
                                  </td>
                                  <td className="font-mono text-[12px]">{asset.assetCode || "—"}</td>
                                  <td className="font-mono text-[12px]">{asset.serialNumber || "—"}</td>
                                  <td>{asset.purchaseDate ? formatDate(asset.purchaseDate) : "—"}</td>
                                  <td>
                                    <Badge variant="info">assigned</Badge>
                                  </td>
                                  <td>
                                    <div className="flex justify-end">
                                      <button
                                        className="btn btn-danger btn-sm flex items-center gap-1"
                                        onClick={() => unassignAssetMutation.mutate(asset.id)}
                                        disabled={unassignAssetMutation.isPending}
                                      >
                                        <Unlink size={12} /> Unassign
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} className="text-center py-14" style={{ color: "var(--text-muted)" }}>
                                  <Laptop size={28} className="mx-auto mb-2 opacity-20" />
                                  <p className="text-[13px]">No assets assigned yet.</p>
                                  <p className="text-[11px] mt-1">Click "Assign Asset" to add one.</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* ================= TIMELINE ================= */}
                {activeTab === "timeline" && (
                  <div className="card p-5 sm:p-6">
                    <h2 className="text-[15px] font-semibold mb-6" style={{ color: "var(--text-primary)" }}>
                      Employee Activity Timeline
                    </h2>

                    {(timelineData?.timeline || []).length ? (
                      <div className="relative pl-2">
                        {/* vertical connector line */}
                        <div
                          className="absolute left-[7px] top-1 bottom-1 w-px"
                          style={{ background: "var(--border)" }}
                        />
                        <div className="space-y-6">
                          {timelineData.timeline.map((event) => {
                            const meta = TIMELINE_LABELS[event.action] || {
                              label: event.action,
                              color: "var(--text-muted)",
                            };
                            const detail = describeChanges(event.action, event.changes);
                            return (
                              <div key={event.id} className="relative flex gap-4">
                                <span
                                  className="relative z-10 w-3.5 h-3.5 rounded-full mt-1 shrink-0 ring-4"
                                  style={{ background: meta.color, "--tw-ring-color": "var(--surface)" }}
                                />
                                <div className="-mt-0.5">
                                  <h4 className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>
                                    {meta.label}
                                  </h4>
                                  {detail && (
                                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                                      {detail}
                                    </p>
                                  )}
                                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                    {formatDate(event.createdAt, "MMM d, yyyy h:mm a")}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-center py-10" style={{ color: "var(--text-muted)" }}>
                        No activity recorded yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ================= RIGHT SIDEBAR ================= */}
          <div className="space-y-6">
            <div className="card p-5 sm:p-6">
              <h2 className="text-[14px] font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
                Employee Summary
              </h2>
              <div className="space-y-4">
                <Field icon={<Briefcase size={13} />} label="Employee ID" value={employee.employeeId} />
                <Field icon={<Building2 size={13} />} label="Department" value={employee.department} />
                <Field icon={<User size={13} />} label="Designation" value={employee.designation} />
                <Field icon={<Clock size={13} />} label="Employment Type" value={employee.employmentType} />
                <Field icon={<Clock size={13} />} label="Shift" value={employee.shift?.name || "Not assigned"} />
                <Field icon={<Users size={13} />} label="Reporting Manager" value={managerName} />
              </div>
            </div>

            <div className="card p-5 sm:p-6">
              <h2 className="text-[14px] font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
                Contact
              </h2>
              <div className="space-y-4">
                <Field icon={<Mail size={13} />} label="Email" value={employee.email} />
                <Field icon={<Phone size={13} />} label="Phone" value={employee.phone} />
                <Field icon={<MapPin size={13} />} label="Location" value={employee.workLocation || "—"} />
              </div>
            </div>

            <div className="card p-5 sm:p-6">
              <h2 className="text-[14px] font-semibold mb-5" style={{ color: "var(--text-primary)" }}>
                Statistics
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="Leaves" value={stats?.leave?.total ?? 0} />
                <MiniStat label="Attendance" value={`${stats?.attendance?.attendancePercentage ?? 0}%`} />
                <MiniStat label="Reviews" value={stats?.performance?.totalReviews ?? 0} />
                <MiniStat label="Avg. Rating" value={stats?.performance?.averageRating ?? 0} />
              </div>
            </div>

            {/* Assets quick-view sidebar card */}
            <div className="card p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Assets
                </h2>
                <button
                  className="btn btn-secondary btn-sm flex items-center gap-1"
                  onClick={() => setAssetModalOpen(true)}
                >
                  <Plus size={12} /> Assign
                </button>
              </div>
              {(assignedAssets || []).length ? (
                <div className="space-y-2">
                  {assignedAssets.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ background: "var(--surface-2)" }}>
                        {(a.category || "").toLowerCase() === "laptop"
                          ? <Laptop size={11} style={{ color: "var(--primary)" }} />
                          : <Package size={11} style={{ color: "var(--text-muted)" }} />}
                      </span>
                      <span className="text-[12px] truncate" style={{ color: "var(--text-secondary)" }}>{a.name}</span>
                    </div>
                  ))}
                  {assignedAssets.length > 4 && (
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>+{assignedAssets.length - 4} more</p>
                  )}
                </div>
              ) : (
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No assets assigned.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= ASSIGN SHIFT MODAL ================= */}
      <Modal
        open={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        title="Assign Shift"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => setShiftModalOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={assignShiftMutation.isPending}
              onClick={() => assignShiftMutation.mutate(selectedShiftId)}
            >
              {assignShiftMutation.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-1">
          <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Choose the working shift for <strong>{employee.firstName} {employee.lastName}</strong>.
          </p>
          <div>
            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
              Shift
            </label>
            <select
              className="input w-full"
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
            >
              <option value="">No shift assigned</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.startTime && s.endTime ? ` (${s.startTime}–${s.endTime})` : ""}
                </option>
              ))}
            </select>
          </div>
          {employee.shift?.name && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Currently assigned: <strong>{employee.shift.name}</strong>
            </p>
          )}
        </div>
      </Modal>

      {/* ================= ADD DOCUMENT MODAL ================= */}
      <Modal
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        title="Add Document"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => setDocModalOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={addDocument.isPending || !docForm.name || !docForm.url}
              onClick={() => addDocument.mutate(docForm)}
            >
              {addDocument.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-1">
          <div>
            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Document Name</label>
            <input
              type="text"
              className="input w-full"
              placeholder="e.g. Employment Contract"
              value={docForm.name}
              onChange={(e) => setDocForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Document URL</label>
            <input
              type="text"
              className="input w-full"
              placeholder="https://…"
              value={docForm.url}
              onChange={(e) => setDocForm((f) => ({ ...f, url: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* ================= NEW PERFORMANCE REVIEW MODAL ================= */}
      {/* <Modal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        title="New Performance Review"
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => setReviewModalOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={createReview.isPending || !reviewForm.reviewPeriod}
              onClick={() => createReview.mutate(reviewForm)}
            >
              {createReview.isPending ? "Saving…" : "Save Review"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 p-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Review Period *</label>
              <input
                type="text"
                className="input w-full"
                placeholder="e.g. Q3 2026"
                value={reviewForm.reviewPeriod}
                onChange={(e) => setReviewForm((f) => ({ ...f, reviewPeriod: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Review Date</label>
              <input
                type="date"
                className="input w-full"
                value={reviewForm.reviewDate}
                onChange={(e) => setReviewForm((f) => ({ ...f, reviewDate: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
              Ratings (1–5)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {RATING_FIELDS.map(([label, key]) => (
                <div key={key}>
                  <label className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>{label}</label>
                  <select
                    className="input w-full"
                    value={reviewForm[key]}
                    onChange={(e) => setReviewForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ReviewTextarea label="Strengths" value={reviewForm.strengths}
              onChange={(v) => setReviewForm((f) => ({ ...f, strengths: v }))} />
            <ReviewTextarea label="Areas to Improve" value={reviewForm.weaknesses}
              onChange={(v) => setReviewForm((f) => ({ ...f, weaknesses: v }))} />
            <ReviewTextarea label="Manager Feedback" value={reviewForm.managerFeedback}
              onChange={(v) => setReviewForm((f) => ({ ...f, managerFeedback: v }))} />
            <ReviewTextarea label="Employee Feedback / Goals" value={reviewForm.employeeFeedback}
              onChange={(v) => setReviewForm((f) => ({ ...f, employeeFeedback: v }))} />
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={reviewForm.promotionEligible}
                onChange={(e) => setReviewForm((f) => ({ ...f, promotionEligible: e.target.checked }))}
              />
              Promotion eligible
            </label>
            <div className="flex items-center gap-2">
              <label className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Recommended increment %</label>
              <input
                type="number"
                className="input w-24"
                value={reviewForm.salaryIncrementRecommendation}
                onChange={(e) => setReviewForm((f) => ({ ...f, salaryIncrementRecommendation: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>
      </Modal> */}

      {/* ================= PERFORMANCE REVIEW MODAL ================= */}
      {canReview && (
        <Modal
          open={reviewModalOpen}
          onClose={() => { setReviewModalOpen(false); setEditingReviewId(null); setReviewForm(emptyReview); }}
          title={editingReviewId ? "Edit Performance Review" : "New Performance Review"}
          size="lg"
          footer={
            <div className="flex justify-end gap-3">
              <button className="btn btn-ghost" onClick={() => { setReviewModalOpen(false); setEditingReviewId(null); setReviewForm(emptyReview); }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleReviewSubmit}
                disabled={createReviewMutation.isPending || updateReviewMutation.isPending}
              >
                {createReviewMutation.isPending || updateReviewMutation.isPending
                  ? "Saving…"
                  : editingReviewId ? "Update Review" : "Submit Review"}
              </button>
            </div>
          }
        >
          <div className="space-y-6 p-1">

            {/* Period + Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Review Period *
                </label>
                <input
                  className="input w-full"
                  placeholder="e.g. Q1 2026, H1 2026, Annual 2026"
                  value={reviewForm.reviewPeriod}
                  onChange={(e) => setReviewForm((p) => ({ ...p, reviewPeriod: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Review Date
                </label>
                <input
                  type="date"
                  className="input w-full"
                  value={reviewForm.reviewDate}
                  onChange={(e) => setReviewForm((p) => ({ ...p, reviewDate: e.target.value }))}
                />
              </div>
            </div>

            {/* Rating fields */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: "var(--text-muted)" }}>
                Ratings (1 – 5 stars)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {RATING_FIELDS.map(([label, key]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium w-36 shrink-0" style={{ color: "var(--text-secondary)" }}>
                      {label}
                    </span>
                    <StarPicker
                      value={reviewForm[key] ?? 3}
                      onChange={(val) => setRating(key, val)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Live overall preview */}
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <Star size={18} fill="var(--warning, #f59e0b)" stroke="var(--warning, #f59e0b)" />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Overall Preview:{" "}
                <strong style={{ color: "var(--warning, #f59e0b)" }}>
                  {(
                    RATING_FIELDS.reduce((s, [, k]) => s + (reviewForm[k] ?? 0), 0) /
                    RATING_FIELDS.length
                  ).toFixed(2)}
                  {" "}/ 5
                </strong>
              </span>
            </div>

            {/* Narrative */}
            {[
              ["Strengths", "strengths", "What does this employee do well?"],
              ["Areas to Improve", "weaknesses", "Where can they grow?"],
              ["Manager Feedback", "managerFeedback", "Your overall feedback as reviewer…"],
              ["Employee Feedback / Goals", "employeeFeedback", "Employee's own comments or goals…"],
            ].map(([label, key, placeholder]) => (
              <div key={key}>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                  {label}
                </label>
                <textarea
                  rows={3}
                  className="input w-full resize-none"
                  placeholder={placeholder}
                  value={reviewForm[key]}
                  onChange={(e) => setReviewForm((p) => ({ ...p, [key]: e.target.value }))}
                />
              </div>
            ))}

            {/* Outcomes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Salary Increment Recommendation (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input w-full"
                  placeholder="0"
                  value={reviewForm.salaryIncrementRecommendation}
                  onChange={(e) => setReviewForm((p) => ({ ...p, salaryIncrementRecommendation: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <label className="relative inline-flex items-center cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={reviewForm.promotionEligible}
                    onChange={(e) => setReviewForm((p) => ({ ...p, promotionEligible: e.target.checked }))}
                  />
                  <div className="w-9 h-5 bg-gray-300 peer-checked:bg-blue-500 rounded-full transition-colors relative after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-4 after:h-4 after:transition-transform peer-checked:after:translate-x-4" />
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    Promotion Eligible
                  </span>
                </label>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ================= DELETE CONFIRM MODAL ================= */}
      {canReview && (
        <Modal
          open={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          title="Delete Review"
          size="sm"
          footer={
            <div className="flex justify-end gap-3">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirmId(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteReviewMutation.mutate(deleteConfirmId)}
                disabled={deleteReviewMutation.isPending}
              >
                {deleteReviewMutation.isPending ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          }
        >
          <p className="p-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Are you sure you want to permanently delete this performance review? This action cannot be undone.
          </p>
        </Modal>
      )}

      {/* ================= ASSIGN ASSET MODAL ================= */}
      <Modal
        open={assetModalOpen}
        onClose={() => { setAssetModalOpen(false); setSelectedAssetId(""); }}
        title="Assign Asset"
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost" onClick={() => { setAssetModalOpen(false); setSelectedAssetId(""); }}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={assignAssetMutation.isPending || !selectedAssetId}
              onClick={() => assignAssetMutation.mutate(selectedAssetId)}
            >
              {assignAssetMutation.isPending ? "Assigning…" : "Assign"}
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-1">
          <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Choose an available asset to assign to <strong>{employee?.firstName} {employee?.lastName}</strong>.
          </p>
          <div>
            <label className="text-[13px] font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
              Available Asset
            </label>
            <select
              className="input w-full"
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
            >
              <option value="">Select an asset…</option>
              {availableAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.brand ? ` — ${a.brand}` : ""}{a.assetCode ? ` (${a.assetCode})` : ""}
                  {a.category ? ` · ${a.category}` : ""}
                </option>
              ))}
            </select>
            {availableAssets.length === 0 && (
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                No available assets found. Add assets from the Inventory → Assets module.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Local presentational helpers
// ─────────────────────────────────────────────────────────────
function MiniStat({ label, value }) {
  return (
    <div
      className="rounded-xl p-4 text-center border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</p>
      <h3 className="text-xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{value}</h3>
    </div>
  );
}