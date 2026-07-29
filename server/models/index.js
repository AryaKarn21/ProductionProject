import Company from "./Company.js";
import User from "./User.js";
import Meeting from "./Meeting.js";
import MeetingAttendee from "./MeetingAttendee.js";
import UserCompany from "./UserCompany.js";
import Account from "./Account.js";
import Contact from "./Contact.js";
import Opportunity from "./Opportunity.js";
import Lead from "./Lead.js";
import LeadNote from "./LeadNote.js";
import Employee from "./Employee.js";
import EmployeeDocument from "./EmployeeDocument.js";
import EmployeeEducation from "./EmployeeEducation.js";
import EmployeeExperience from "./EmployeeExperience.js";
import PerformanceReview from "./PerformanceReview.js";
import Attendance from "./Attendance.js";
import Shift from "./Shift.js";
import Leave from "./Leave.js";
import LeaveType from "./LeaveType.js";
import Holiday from "./Holiday.js";
import PayrollRun from "./PayrollRun.js";
import Payslip from "./Payslip.js";
import Expense from "./Expense.js";
import LedgerEntry from "./LedgerEntry.js";
import Warehouse from "./Warehouse.js";
import InventoryItem from "./InventoryItem.js";
import Asset from "./Asset.js";
import StockTransfer from "./StockTransfer.js";
import StockAdjustment from "./stockAdjustment.js";
import Vendor from "./Vendor.js";
import PurchaseOrder from "./PurchaseOrder.js";
import PurchaseOrderItem from "./PurchaseOrderItem.js";
import Project from "./Project.js";
import ProjectMember from "./ProjectMember.js";
import Task from "./Task.js";
import Ticket from "./Ticket.js";
import TicketReply from "./TicketReply.js";
import AuditLog from "./AuditLog.js";
import Role from "./Role.js";
import OTP from "./OTP.js";
import Notification from "./Notification.js";
import NotificationPreference from "./NotificationPreference.js";
import DailyReport from "./DailyReport.js";
// Email module — models + associations live in EmailModels.js
import {
  EmailAccount,
  EmailThread,
  Email,
  EmailAttachment,
  EmailTemplate,
  EmailSignature,
  EmailLabel,
  EmailFolder,
  EmailRule,
  EmailEvent,
} from "./Emailmodels.js";



// ── Company ───────────────────────────────────────────────
Company.hasMany(Company, { as: "children", foreignKey: "parentId" });
Company.belongsTo(Company, { as: "parent", foreignKey: "parentId" });

// ── User <-> Company (many-to-many, was User.companies: [ObjectId]) ──
User.belongsToMany(Company, {
  through: UserCompany,
  foreignKey: "userId",
  otherKey: "companyId",
  as: "companies",
});
Company.belongsToMany(User, {
  through: UserCompany,
  foreignKey: "companyId",
  otherKey: "userId",
  as: "users",
});
User.belongsTo(Company, { as: "company", foreignKey: "companyId" }); // home company
// ── Role ───────────────────────────────────────────────

Role.belongsTo(Company, {
  foreignKey: "companyId",
});

Company.hasMany(Role, {
  foreignKey: "companyId",
});

Role.hasMany(User, {
  foreignKey: "roleId",
});

User.belongsTo(Role, {
  as: "roleInfo",
  foreignKey: "roleId",
});

// ── Role hierarchy ─────────────────────────────────────
// A child role inherits every permission its parent grants.
// resolveRolePermissions() in middleware/auth.js walks this chain.
Role.belongsTo(Role, { as: "parent", foreignKey: "parentRoleId" });
Role.hasMany(Role, { as: "children", foreignKey: "parentRoleId" });

// ── UserCompany (membership + per-company role) ────────
// The belongsToMany above gives you user.companies, but it does not
// expose the join row itself. protect() in middleware/auth.js needs
// that row so it can read user_companies.roleId and work out which
// role this user holds in the company they are currently working in.
//
// WITHOUT THIS BLOCK every authenticated request throws
// SequelizeEagerLoadingError, protect() turns it into a 401, and the
// axios interceptor logs the user straight back out — which looks
// exactly like "login succeeds but returns to the login page".
//
// NOTE: the Company alias here is "companyRef", not "company",
// because "company" is already taken by User.belongsTo(Company) above
// and Sequelize rejects a duplicate alias in the same query.
User.hasMany(UserCompany, { as: "memberships", foreignKey: "userId" });
UserCompany.belongsTo(User, { as: "user", foreignKey: "userId" });
UserCompany.belongsTo(Company, { as: "companyRef", foreignKey: "companyId" });
UserCompany.belongsTo(Role, { as: "role", foreignKey: "roleId" });
Role.hasMany(UserCompany, { as: "memberships", foreignKey: "roleId" });

// Company → Meetings
Company.hasMany(Meeting, {
  foreignKey: "companyId",
  as: "meetings",
});

Meeting.belongsTo(Company, {
  foreignKey: "companyId",
  as: "company",
});

// User → Organized Meetings
User.hasMany(Meeting, {
  foreignKey: "organizerId",
  as: "organizedMeetings",
});

Meeting.belongsTo(User, {
  foreignKey: "organizerId",
  as: "organizer",
});

// User -> Notifications (received)
User.hasMany(Notification, {
  foreignKey: "userId",
  as: "notifications",
});

Notification.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

// User -> Notification Sender
User.hasMany(Notification, {
  foreignKey: "senderId",
  as: "sentNotifications",
});

Notification.belongsTo(User, {
  foreignKey: "senderId",
  as: "sender",
});

// User -> Preferences
User.hasOne(NotificationPreference, {
  foreignKey: "userId",
  as: "notificationPreference",
});

NotificationPreference.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

// ── Account ───────────────────────────────────────────────
Account.belongsTo(Company, { foreignKey: "companyId" });
Account.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });
Account.hasMany(Contact, { as: "contacts", foreignKey: "accountId" });
Account.hasMany(Opportunity, { as: "opportunities", foreignKey: "accountId" });

// ── Contact ───────────────────────────────────────────────
Contact.belongsTo(Company, { foreignKey: "companyId" });
Contact.belongsTo(Account, { as: "account", foreignKey: "accountId" });
Contact.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });

// ── Opportunity ───────────────────────────────────────────
Opportunity.belongsTo(Company, { foreignKey: "companyId" });
Opportunity.belongsTo(Account, { as: "account", foreignKey: "accountId" });
Opportunity.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });

// ── Lead ──────────────────────────────────────────────────
Lead.belongsTo(Company, {
  as: "company",
  foreignKey: "companyId",
});
Lead.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });
Lead.belongsTo(Account, {
  as: "convertedAccount",
  foreignKey: "convertedAccountId",
});
Lead.belongsTo(Contact, {
  as: "convertedContact",
  foreignKey: "convertedContactId",
});
Lead.belongsTo(Opportunity, {
  as: "convertedOpportunity",
  foreignKey: "convertedOpportunityId",
});
Lead.hasMany(LeadNote, { as: "notes", foreignKey: "leadId" });
LeadNote.belongsTo(Lead, { foreignKey: "leadId" });
LeadNote.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });

// ── Employee ──────────────────────────────────────────────
Employee.belongsTo(Company, { foreignKey: "companyId" });
Employee.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasOne(Employee, { as: "employee", foreignKey: "userId" });
Employee.hasMany(EmployeeDocument, {
  as: "documents",
  foreignKey: "employeeId",
});
EmployeeDocument.belongsTo(Employee, { foreignKey: "employeeId" });

/*
 * Education and past employment.
 *
 * onDelete CASCADE on both: these rows describe one person and have no
 * meaning without them. Leaving them behind after the employee is
 * deleted would orphan the data and leak a former employee's salary
 * history and referee contacts into a table nobody is looking at.
 *
 * The aliases matter — routes include these as "educations" and
 * "experiences", and a missing or mismatched alias is what produced the
 * "Employee is not associated to X using alias" errors elsewhere in
 * this file.
 */
Employee.hasMany(EmployeeEducation, {
  as: "educations",
  foreignKey: "employeeId",
  onDelete: "CASCADE",
});
EmployeeEducation.belongsTo(Employee, { foreignKey: "employeeId" });

Employee.hasMany(EmployeeExperience, {
  as: "experiences",
  foreignKey: "employeeId",
  onDelete: "CASCADE",
});
EmployeeExperience.belongsTo(Employee, { foreignKey: "employeeId" });

// Who signed off the verification, for both tables.
EmployeeEducation.belongsTo(User, { as: "verifiedBy", foreignKey: "verifiedById" });
EmployeeExperience.belongsTo(User, { as: "verifiedBy", foreignKey: "verifiedById" });
Employee.hasMany(Payslip, { as: "payslips", foreignKey: "employeeId" });
Employee.hasMany(Leave, { as: "leaves", foreignKey: "employeeId" });
Employee.hasMany(Attendance, {
  as: "attendanceRecords",
  foreignKey: "employeeId",
});
Employee.hasMany(Asset, { as: "assets", foreignKey: "assignedToId" });

// Employee -> Shift
Employee.belongsTo(Shift, { as: "shift", foreignKey: "shiftId" });
Shift.hasMany(Employee, { as: "employees", foreignKey: "shiftId" });

// Employee -> Reporting Manager (self-referencing)
Employee.belongsTo(Employee, {
  as: "reportingManager",
  foreignKey: "reportingManagerId",
});
Employee.hasMany(Employee, {
  as: "directReports",
  foreignKey: "reportingManagerId",
});

// ── Employee -> Performance Reviews ─────────────────────────

// Employee being reviewed
Employee.hasMany(PerformanceReview, {
  as: "performanceReviews",
  foreignKey: "employeeId",
});

PerformanceReview.belongsTo(Employee, {
  as: "employee",
  foreignKey: "employeeId",
});

// Employee record of the person who performed/submitted the review.
// reviewerId stores an employees.id — performance.routes.js looks up the
// reviewer's Employee record and every query does
// `include: [{ model: Employee, as: "reviewer" }]`. This association was
// previously declared against User, which contradicted both the stored
// data and those includes, so Sequelize threw SequelizeEagerLoadingError
// ("Employee is not associated to PerformanceReview using alias
// 'reviewer'") — the 400 that surfaced as the "check your input" toast on
// the Performance tab.
Employee.hasMany(PerformanceReview, {
  as: "reviewsGiven",
  foreignKey: "reviewerId",
});

PerformanceReview.belongsTo(Employee, {
  as: "reviewer",
  foreignKey: "reviewerId",
});


// Company
PerformanceReview.belongsTo(Company, {
  as: "company",
  foreignKey: "companyId",
});


//Meeting


Meeting.hasMany(MeetingAttendee, {
  foreignKey: "meetingId",
  as: "attendees",
});

// ── Daily Reports ─────────────────────────────────────────
DailyReport.belongsTo(Company, { foreignKey: "companyId" });
DailyReport.belongsTo(Employee, { as: "employee", foreignKey: "employeeId" });
DailyReport.belongsTo(User, { as: "submittedBy", foreignKey: "submittedById" });
Employee.hasMany(DailyReport, { as: "dailyReports", foreignKey: "employeeId" });
MeetingAttendee.belongsTo(Meeting, {
  foreignKey: "meetingId",
  as: "meeting",
});

User.hasMany(MeetingAttendee, {
  foreignKey: "userId",
  as: "meetingInvitations",
});

MeetingAttendee.belongsTo(User, {
  foreignKey: "userId",
  as: "user",
});

// ── Attendance ────────────────────────────────────────────
Attendance.belongsTo(Company, { foreignKey: "companyId" });
Attendance.belongsTo(Employee, { as: "employee", foreignKey: "employeeId" });

// ── Shift ─────────────────────────────────────────────

Shift.belongsTo(Company, {
  foreignKey: "companyId",
});

Company.hasMany(Shift, {
  as: "shifts",
  foreignKey: "companyId",
});

Shift.hasMany(Attendance, {
  as: "attendance",
  foreignKey: "shiftId",
});

Attendance.belongsTo(Shift, {
  as: "shift",
  foreignKey: "shiftId",
});
// ── Leave / LeaveType ─────────────────────────────────────
Leave.belongsTo(Company, { foreignKey: "companyId" });
Leave.belongsTo(Employee, { as: "employee", foreignKey: "employeeId" });
Leave.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });
LeaveType.belongsTo(Company, { foreignKey: "companyId" });

// ── Holiday ───────────────────────────────────────────────
Holiday.belongsTo(Company, { foreignKey: "companyId" });
Company.hasMany(Holiday, { as: "holidays", foreignKey: "companyId" });

// ── Payroll ───────────────────────────────────────────────
PayrollRun.belongsTo(Company, { foreignKey: "companyId" });
PayrollRun.belongsTo(User, { as: "processedBy", foreignKey: "processedById" });
PayrollRun.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });
PayrollRun.hasMany(Payslip, { as: "payslips", foreignKey: "payrollRunId" });
Payslip.belongsTo(Company, { foreignKey: "companyId" });
Payslip.belongsTo(Employee, { as: "employee", foreignKey: "employeeId" });
Payslip.belongsTo(PayrollRun, { as: "payrollRun", foreignKey: "payrollRunId" });

// ── Finance ───────────────────────────────────────────────
Expense.belongsTo(Company, { foreignKey: "companyId" });
Expense.belongsTo(User, { as: "submittedBy", foreignKey: "submittedById" });
Expense.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });
LedgerEntry.belongsTo(Company, { foreignKey: "companyId" });
LedgerEntry.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });

// ── Inventory ─────────────────────────────────────────────
Warehouse.belongsTo(Company, { foreignKey: "companyId" });
Warehouse.belongsTo(Employee, { as: "manager", foreignKey: "managerId" });
InventoryItem.belongsTo(Company, { foreignKey: "companyId" });
InventoryItem.belongsTo(Warehouse, {
  as: "warehouse",
  foreignKey: "warehouseId",
});
Asset.belongsTo(Company, {
  foreignKey: "companyId",
});

Asset.belongsTo(Employee, {
  as: "assignedTo",
  foreignKey: "assignedToId",
});

Asset.belongsTo(Warehouse, {
  as: "warehouse",
  foreignKey: "warehouseId",
});

Warehouse.hasMany(Asset, {
  as: "assets",
  foreignKey: "warehouseId",
});

StockTransfer.belongsTo(Company, {
  foreignKey: "companyId",
});

StockTransfer.belongsTo(InventoryItem, {
  as: "item",
  foreignKey: "itemId",
});

StockTransfer.belongsTo(Warehouse, {
  as: "fromWarehouse",
  foreignKey: "fromWarehouseId",
});

StockTransfer.belongsTo(Warehouse, {
  as: "toWarehouse",
  foreignKey: "toWarehouseId",
});

StockTransfer.belongsTo(User, {
  as: "createdBy",
  foreignKey: "createdById",
});

InventoryItem.hasMany(StockTransfer, {
  as: "transfers",
  foreignKey: "itemId",
});

Warehouse.hasMany(StockAdjustment, {
  foreignKey: "warehouseId",
  as: "adjustments",
});

StockAdjustment.belongsTo(Warehouse, {
  foreignKey: "warehouseId",
  as: "warehouse",
});

InventoryItem.hasMany(StockAdjustment, {
  foreignKey: "itemId",
  as: "adjustments",
});

StockAdjustment.belongsTo(InventoryItem, {
  foreignKey: "itemId",
  as: "item",
});

User.hasMany(StockAdjustment, {
  foreignKey: "createdById",
  as: "stockAdjustments",
});

StockAdjustment.belongsTo(User, {
  foreignKey: "createdById",
  as: "createdBy",
});

// ── Procurement ───────────────────────────────────────────
Vendor.belongsTo(Company, { foreignKey: "companyId" });
PurchaseOrder.belongsTo(Company, { foreignKey: "companyId" });
PurchaseOrder.belongsTo(Vendor, { as: "vendor", foreignKey: "vendorId" });
PurchaseOrder.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });
PurchaseOrder.belongsTo(User, { as: "approvedBy", foreignKey: "approvedById" });
PurchaseOrder.hasMany(PurchaseOrderItem, {
  as: "items",
  foreignKey: "purchaseOrderId",
});
PurchaseOrderItem.belongsTo(PurchaseOrder, { foreignKey: "purchaseOrderId" });

// ── Projects ──────────────────────────────────────────────
Project.belongsTo(Company, { foreignKey: "companyId" });
Project.belongsTo(User, { as: "manager", foreignKey: "managerId" });
Project.hasMany(ProjectMember, { as: "members", foreignKey: "projectId" });
Project.hasMany(Task, { as: "tasks", foreignKey: "projectId" });
ProjectMember.belongsTo(Project, { foreignKey: "projectId" });
ProjectMember.belongsTo(User, { as: "user", foreignKey: "userId" });
Task.belongsTo(Company, { foreignKey: "companyId" });
Task.belongsTo(Project, { as: "project", foreignKey: "projectId" });
Task.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });

// ── Support ───────────────────────────────────────────────
Ticket.belongsTo(Company, { foreignKey: "companyId" });
Ticket.belongsTo(User, { as: "assignedTo", foreignKey: "assignedToId" });
Ticket.belongsTo(User, { as: "createdBy", foreignKey: "createdById" });
Ticket.hasMany(TicketReply, { as: "replies", foreignKey: "ticketId" });
TicketReply.belongsTo(Ticket, { foreignKey: "ticketId" });
TicketReply.belongsTo(User, { as: "author", foreignKey: "authorId" });

// ── Audit ─────────────────────────────────────────────────
AuditLog.belongsTo(Company, { foreignKey: "companyId" });
AuditLog.belongsTo(User, { as: "user", foreignKey: "userId" });


// Make every model emit `_id` (aliasing the real `id`) in its JSON output,
// so the existing React frontend — which expects Mongo-style `_id` in 22+
// places — keeps working without any client-side changes.
import { withMongoCompatJSON } from "./mongoCompat.js";
import PasswordResetToken from "./PasswordResetToken.js";
const allModels = [
  Company,
  User,
  UserCompany,
  Role,
  Account,
  Contact,
  Opportunity,
  Lead,
  LeadNote,
  Employee,
  Meeting,
  MeetingAttendee,
  EmployeeDocument,
  Attendance,
  Shift,
  Leave,
  LeaveType,
  Holiday,
  PayrollRun,
  Payslip,
  Expense,
  LedgerEntry,
  Warehouse,
  InventoryItem,
  Asset,
  StockTransfer,
  StockAdjustment,
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  Project,
  ProjectMember,
  Task,
  Ticket,
  TicketReply,
  AuditLog,
  OTP,
  PasswordResetToken,
  Notification,
  NotificationPreference,
  PerformanceReview,
   DailyReport,
   EmailAccount,
  EmailThread,
  Email,
  EmailAttachment,
  EmailTemplate,
  EmailSignature,
  EmailLabel,
  EmailFolder,
  EmailRule,
  EmailEvent,
  
];
allModels.forEach(withMongoCompatJSON);

// Every create/update/delete on a business model now writes an audit row
// automatically. Registered last, after all models and associations
// exist, so the hooks see the finished registry.
//
// This is what gives the parent company visibility into its child
// companies: previously only 9 of 28 route files logged anything, so
// most of what a child company did left no record at all.
import { registerAuditHooks } from "./auditHooks.js";
registerAuditHooks();

export {
  Company,
  User,
  UserCompany,
  Role,
  Account,
  Meeting,
  MeetingAttendee,
  Contact,
  Opportunity,
  Lead,
  LeadNote,
  Employee,
  EmployeeDocument,
  EmployeeEducation,
  EmployeeExperience,
  Attendance,
  Shift,
  Leave,
  LeaveType,
  Holiday,
  PayrollRun,
  Payslip,
  Expense,
  LedgerEntry,
  Warehouse,
  InventoryItem,
  Asset,
  StockTransfer,
  StockAdjustment,
  Vendor,
  PurchaseOrder,
  PurchaseOrderItem,
  Project,
  ProjectMember,
  Task,
  Ticket,
  TicketReply,
  AuditLog,
  OTP,
  PasswordResetToken,
  Notification,
  NotificationPreference,
  PerformanceReview,
   DailyReport,
   EmailAccount,
  EmailThread,
  Email,
  EmailAttachment,
  EmailTemplate,
  EmailSignature,
  EmailLabel,
  EmailFolder,
  EmailRule,
  EmailEvent,
};