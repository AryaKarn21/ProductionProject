import { createBrowserRouter } from "react-router-dom";
import { lazy, Suspense } from "react";
import ProtectedRoute from "./ProtectedRoute";
import PermissionGuard from "./PermissionGuard";
import AppShell from "@/components/layout/AppShell";
import Spinner from "@/components/ui/Spinner";

// ── Eagerly loaded (always needed) ──────────────────────────
import Login from "@/pages/auth/Login";
import NotFound from "@/pages/errors/NotFound";
import Unauthorized from "@/pages/errors/Unauthorized";
import NotificationCenter from "@/pages/notifications/NotificationCenter";

// NOTE: you already had an Unauthorized page at @/pages/errors/Unauthorized,
// so the components/shared/Unauthorized.jsx I sent earlier is redundant —
// importing both produced a duplicate-identifier SyntaxError. Delete
// client/src/components/shared/Unauthorized.jsx from the project.

// ── Lazy loaded (only when route is visited) ─────────────────
const Dashboard = lazy(() => import("@/pages/dashboard/Dashboard"));
const LeadsList = lazy(() => import("@/pages/crm/leads/LeadsList"));
const LeadDetail = lazy(() => import("@/pages/crm/leads/LeadDetail"));
const LeadKanban = lazy(() => import("@/pages/crm/leads/LeadKanban"));
const AccountsList = lazy(() => import("@/pages/crm/accounts/AccountsList"));
const AccountDetail = lazy(() => import("@/pages/crm/accounts/AccountDetail"));
const AccountEdit = lazy(() => import("@/pages/crm/accounts/AccountEdit"));
const LeadEdit = lazy(() => import("@/pages/crm/leads/LeadEdit"));
const ContactsList = lazy(() => import("@/pages/crm/contacts/ContactsList"));
const ContactEdit = lazy(() => import("@/pages/crm/contacts/ContactEdit"));
const OpportunitiesList = lazy(
  () => import("@/pages/crm/opportunities/OpportunitiesList"),
);
const OpportunityKanban = lazy(
  () => import("@/pages/crm/opportunities/OpportunityKanban"),
);
const OpportunityDetail = lazy(
  () => import("@/pages/crm/opportunities/OpportunityDetail"),
);
const OpportunityEdit = lazy(
  () => import("@/pages/crm/opportunities/OpportunityEdit"),
);

const EmployeesList = lazy(() => import("@/pages/hr/employees/EmployeesList"));
const EmployeeDetail = lazy(
  () => import("@/pages/hr/employees/EmployeeDetail"),
);
const EmployeeEdit = lazy(() => import("@/pages/hr/employees/EmployeeEdit"));
const AttendanceLogs = lazy(
  () => import("@/pages/hr/attendance/AttendanceLogs"),
);
const Holidays = lazy(
  () => import("@/pages/hr/attendance/Holidays"),
);

const LeaveRequests = lazy(() => import("@/pages/hr/leaves/LeaveRequests"));
const LeaveEdit = lazy(() => import("@/pages/hr/leaves/LeaveEdit"));
const PayrollRuns = lazy(() => import("@/pages/hr/payroll/PayrollRuns"));
const ShiftsPage = lazy(() => import("@/pages/hr/shifts/Shiftspage"));

const FinanceOverview = lazy(
  () => import("@/pages/finance/overview/FinanceOverview"),
);
const ExpensesList = lazy(
  () => import("@/pages/finance/expenses/ExpensesList"),
);
const GeneralLedger = lazy(
  () => import("@/pages/finance/ledger/GeneralLedger"),
);
const ExpenseDetails = lazy(
  () => import("@/pages/finance/expenses/ExpenseDetails"),
);
const EditExpense = lazy(() => import("@/pages/finance/expenses/EditExpense"));

// inventory
const ItemsList = lazy(() => import("@/pages/inventory/ItemsList"));
const Warehouses = lazy(() => import("@/pages/inventory/Warehouses"));
const Assets = lazy(() => import("@/pages/inventory/Assets"));
const StockTransfers = lazy(() => import("@/pages/inventory/StockTransfers"));
const StockAdjustments = lazy(
  () => import("@/pages/inventory/StockAdjustments"),
);
const PurchaseOrders = lazy(() => import("@/pages/procurement/PurchaseOrders"));
const PurchaseDetails = lazy(
  () => import("@/pages/procurement/PurchaseDetails"),
);
const PurchaseEdit = lazy(() => import("@/pages/procurement/PurchaseEdit"));
const ProjectsList = lazy(() => import("@/pages/projects/ProjectsList"));
const ProjectDetail = lazy(() => import("@/pages/projects/ProjectDetail"));
const ProjectEdit = lazy(() => import("@/pages/projects/ProjectEdit"));
const TicketsList = lazy(() => import("@/pages/support/TicketsList"));
const SupportEdit = lazy(() => import("@/pages/support/SupportEdit"));
const SupportDetail = lazy(() => import("@/pages/support/SupportDetail"));
const Analytics = lazy(() => import("@/pages/reports/Analytics"));

// ── Group Console ────────────────────────────────────────────
// Parent-company oversight of every company below it in the hierarchy.
const GroupOverview = lazy(() => import("@/pages/group/GroupOverview"));
const GroupActivity = lazy(() => import("@/pages/group/GroupActivity"));
const GroupCompanies = lazy(() => import("@/pages/group/GroupCompanies"));
const GroupCompanyDetail = lazy(() => import("@/pages/group/GroupCompanyDetail"));
const Settings = lazy(() => import("@/pages/settings/Settings"));
const UserDetails = lazy(() => import("@/pages/settings/users/UserDetails"));
const UserEdit = lazy(() => import("@/pages/settings/users/UserEdit"));
const Register = lazy(() => import("@/pages/auth/Register"));
const VerifyOTP = lazy(() => import("@/pages/auth/VerifyOTP"));
const ForgotPassword = lazy(() => import("@/pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/auth/ResetPassword"));
const ProfileSettings = lazy(() => import("@/pages/settings/ProfileSettings"));
const Calendar = lazy(() => import("@/pages/calendar/Calendar"));

// ── Email ─────────────────────────────────────────────────────
// Aliased where the default export name collides with an existing
// page (email/Dashboard.jsx and email/Settings.jsx both export a
// component whose *internal* name shadows dashboard/Dashboard and
// reports/Analytics — the import alias below is what matters, not
// the function's own name).
const EmailDashboard = lazy(() => import("@/pages/email/Dashboard"));
const EmailInbox = lazy(() => import("@/pages/email/Inbox"));
const EmailCompose = lazy(() => import("@/pages/email/Compose"));
const EmailSent = lazy(() => import("@/pages/email/Sent"));
const EmailDrafts = lazy(() => import("@/pages/email/Drafts"));
const EmailArchive = lazy(() => import("@/pages/email/Archive"));
const EmailSpam = lazy(() => import("@/pages/email/Spam"));
const EmailStarred = lazy(() => import("@/pages/email/Starred"));
const EmailTrash = lazy(() => import("@/pages/email/Trash"));
const EmailTemplates = lazy(() => import("@/pages/email/Templates"));
const EmailAnalytics = lazy(() => import("@/pages/email/Analytics"));
const EmailSettings = lazy(() => import("@/pages/email/Settings"));

// ── Suspense wrapper ─────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" />
    </div>
  );
}

function S({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

/*
|--------------------------------------------------------------------------
| G — guarded page helper
|--------------------------------------------------------------------------
| Wraps a lazy page in both the permission guard and the Suspense
| boundary, so each route stays a one-liner instead of four nested tags.
|
|   element: G('leads.view', <LeadsList />)
|
| Without this, ProtectedRoute (a bare "is there a token?" check) was the
| only guard in the whole application, and every page — Settings, Payroll,
| Finance, Users — was reachable just by typing the URL. RoleGuard.jsx
| existed but was never imported anywhere.
*/
function G(permission, element) {
  return (
    <PermissionGuard permission={permission}>
      <S>{element}</S>
    </PermissionGuard>
  );
}

export const router = createBrowserRouter([
  // ── Public routes ─────────────────────────────────────────
  { path: "/login", element: <Login /> },

  {
    path: "/register",
    element: (
      <S>
        <Register />
      </S>
    ),
  },

  {
    path: "/verify-otp",
    element: (
      <S>
        <VerifyOTP />
      </S>
    ),
  },

  {
    path: "/forgot-password",
    element: (
      <S>
        <ForgotPassword />
      </S>
    ),
  },

  {
    path: "/reset-password",
    element: (
      <S>
        <ResetPassword />
      </S>
    ),
  },

  { path: "/unauthorized", element: <Unauthorized /> },

  // ── Authenticated routes ──────────────────────────────────
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            path: "/",
            element: G("dashboard.view", <Dashboard />),
          },

          // Everyone can see their own notifications, so this one is
          // intentionally left ungated.
          {
            path: "/notifications",
            element: (
              <S>
                <NotificationCenter />
              </S>
            ),
          },

          // NOTE: /calendar used to sit OUTSIDE ProtectedRoute, at the
          // top level of this file — meaning it rendered for anyone,
          // logged in or not. Moved inside and gated.
          {
            path: "/calendar",
            element: G("calendar.view", <Calendar />),
          },

          // ── CRM ───────────────────────────────────────────
          {
            path: "/crm/leads",
            element: G("leads.view", <LeadsList />),
          },
          {
            path: "/crm/leads/kanban",
            element: G("leads.view", <LeadKanban />),
          },
          {
            path: "/crm/leads/:id",
            element: G("leads.view", <LeadDetail />),
          },
          {
            path: "/crm/leads/:id/edit",
            element: G("leads.update", <LeadEdit />),
          },

          {
            path: "/crm/accounts",
            element: G("accounts.view", <AccountsList />),
          },
          {
            path: "/crm/accounts/:id",
            element: G("accounts.view", <AccountDetail />),
          },
          {
            path: "/crm/accounts/:id/edit",
            element: G("accounts.update", <AccountEdit />),
          },

          {
            path: "/crm/contacts",
            element: G("contacts.view", <ContactsList />),
          },
          {
            path: "/crm/contacts/:id/edit",
            element: G("contacts.update", <ContactEdit />),
          },

          {
            path: "/crm/opportunities",
            element: G("opportunities.view", <OpportunitiesList />),
          },
          {
            path: "/crm/opportunities/kanban",
            element: G("opportunities.view", <OpportunityKanban />),
          },
          {
            path: "/crm/opportunities/:id",
            element: G("opportunities.view", <OpportunityDetail />),
          },
          {
            path: "/crm/opportunities/:id/edit",
            element: G("opportunities.update", <OpportunityEdit />),
          },

          // ── HR ────────────────────────────────────────────
          {
            path: "/hr/employees",
            element: G("employees.view", <EmployeesList />),
          },
          {
            path: "/hr/employees/:id",
            element: G("employees.view", <EmployeeDetail />),
          },
          {
            path: "/hr/employees/:id/edit",
            element: G("employees.update", <EmployeeEdit />),
          },
          {
            path: "/hr/attendance",
            element: G("attendance.view", <AttendanceLogs />),
          },

          {
            path: "/hr/attendance/holidays",
            element: G("attendance.view", <Holidays />),
          },
          {
            path: "/hr/shifts",
            element: G("attendance.view", <ShiftsPage />),
          },


          {
            path: "/hr/leaves",
            element: G("leave.view", <LeaveRequests />),
          },
          {
            path: "/hr/leaves/:id/edit",
            element: G("leave.update", <LeaveEdit />),
          },
          {
            path: "/hr/payroll",
            element: G("payroll.view", <PayrollRuns />),
          },

          // ── Finance ───────────────────────────────────────
          {
            path: "/finance",
            element: G("finance.view", <FinanceOverview />),
          },
          {
            path: "/finance/expenses",
            element: G("expenses.view", <ExpensesList />),
          },
          {
            path: "/finance/ledger",
            element: G("ledger.view", <GeneralLedger />),
          },
          {
            path: "/finance/expenses/:id",
            element: G("expenses.view", <ExpenseDetails />),
          },
          {
            path: "/finance/expenses/:id/edit",
            element: G("expenses.update", <EditExpense />),
          },

          // ── Inventory ─────────────────────────────────────
          {
            path: "/inventory",
            element: G("inventory.view", <ItemsList />),
          },
          {
            path: "/inventory/warehouses",
            element: G("warehouse.view", <Warehouses />),
          },
          {
            path: "/inventory/assets",
            element: G("assets.view", <Assets />),
          },
          {
            path: "/inventory/transfers",
            element: G("transfers.view", <StockTransfers />),
          },
          {
            path: "/inventory/adjustments",
            element: G("adjustments.view", <StockAdjustments />),
          },

          // ── Procurement ───────────────────────────────────
          {
            path: "/procurement",
            element: G("procurement.view", <PurchaseOrders />),
          },
          {
            path: "/procurement/orders/:id",
            element: G("procurement.view", <PurchaseDetails />),
          },
          {
            path: "/procurement/orders/:id/edit",
            element: G("procurement.update", <PurchaseEdit />),
          },

          // ── Projects ──────────────────────────────────────
          {
            path: "/projects",
            element: G("projects.view", <ProjectsList />),
          },
          {
            path: "/projects/:id",
            element: G("projects.view", <ProjectDetail />),
          },
          {
            path: "/projects/:id/edit",
            element: G("projects.update", <ProjectEdit />),
          },

          // ── Support ───────────────────────────────────────
          {
            path: "/support",
            element: G("support.view", <TicketsList />),
          },
          {
            path: "/support/:id",
            element: G("support.view", <SupportDetail />),
          },
          {
            path: "/support/:id/edit",
            element: G("support.update", <SupportEdit />),
          },

          // ── Reports ───────────────────────────────────────
          {
            path: "/reports",
            element: G("analytics.view", <Analytics />),
          },

          // ── Group Console ─────────────────────────────────
          // Read-only oversight for a parent company over every
          // company beneath it. Scoping is enforced server-side by
          // middleware/groupScope.js; group.view only controls whether
          // the screens are reachable at all.
          {
            path: "/group",
            element: G("group.view", <GroupOverview />),
          },
          {
            path: "/group/activity",
            element: G("group.view", <GroupActivity />),
          },
          {
            path: "/group/structure",
            element: G("group.view", <GroupCompanies />),
          },
          {
            path: "/group/companies/:id",
            element: G("group.view", <GroupCompanyDetail />),
          },

          // ── Email ─────────────────────────────────────────
          {
            path: "/email",
            element: G("email.view", <EmailDashboard />),
          },
          {
            path: "/email/inbox",
            element: G("email.view", <EmailInbox />),
          },
          {
            path: "/email/compose",
            element: G("email.create", <EmailCompose />),
          },
          {
            path: "/email/sent",
            element: G("email.view", <EmailSent />),
          },
          {
            path: "/email/drafts",
            element: G("email.view", <EmailDrafts />),
          },
          {
            path: "/email/archive",
            element: G("email.view", <EmailArchive />),
          },
          {
            path: "/email/spam",
            element: G("email.view", <EmailSpam />),
          },
          {
            path: "/email/starred",
            element: G("email.view", <EmailStarred />),
          },
          {
            path: "/email/trash",
            element: G("email.view", <EmailTrash />),
          },
          {
            path: "/email/templates",
            element: G("email.view", <EmailTemplates />),
          },
          {
            path: "/email/analytics",
            element: G("email.view", <EmailAnalytics />),
          },
          {
            path: "/email/settings",
            element: G("email.update", <EmailSettings />),
          },

          // ── Settings ──────────────────────────────────────
          {
            path: "/settings",
            element: G("settings.view", <Settings />),
          },

          // Editing your own profile needs no permission.
          {
            path: "/settings/profile",
            element: (
              <S>
                <ProfileSettings />
              </S>
            ),
          },

          {
            path: "/settings/users/:id",
            element: G("users.view", <UserDetails />),
          },
          {
            path: "/settings/users/:id/edit",
            element: G("users.update", <UserEdit />),
          },
        ],
      },
    ],
  },

  { path: "*", element: <NotFound /> },
]);