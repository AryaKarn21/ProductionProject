import {
  Activity,
  LogIn,
  KeyRound,
  UserCog,
  CalendarDays,
  Monitor,
  MapPin,
  Clock,
} from "lucide-react";

import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Can from "@/components/shared/Can";
import useCompanyScope from "@/hooks/useCompanyScope";

export default function ActivityCard({ user }) {
  // The audit log is now a parent-company surface, so the link into it
  // has to be gated the same way. Leaving it visible would send a
  // child-company user to a Settings tab that no longer exists for
  // them, landing them on the Users tab with no explanation.
  const { isParentCompany } = useCompanyScope();

  const activities = [
    {
      icon: LogIn,
      title: "Last Login",
      value: user?.lastLogin
        ? new Date(user.lastLogin).toLocaleString()
        : "Never",
      badge: "Latest",
    },
    {
      icon: UserCog,
      title: "Profile Updated",
      value: "2 days ago",
      badge: "Profile",
    },
    {
      icon: KeyRound,
      title: "Password Changed",
      value: "28 days ago",
      badge: "Security",
    },
    {
      icon: CalendarDays,
      title: "Account Created",
      value: user?.createdAt
        ? new Date(user.createdAt).toLocaleDateString()
        : "-",
      badge: "Account",
    },
    {
      icon: Monitor,
      title: "Last Device",
      value: "Windows • Chrome",
      badge: "Device",
    },
    {
      icon: MapPin,
      title: "Last Location",
      value: "Nepal",
      badge: "Location",
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
        className="px-5 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Activity
            size={18}
            style={{ color: "var(--primary)" }}
          />

          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Recent Activity
          </h2>
        </div>

        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          Recent account activity and security history.
        </p>
      </div>

      {/* Activity List */}
      <div>
        {activities.map((item, index) => {
          const Icon = item.icon;

          return (
            <div
              key={index}
              className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-5 py-4 border-b last:border-b-0"
              style={{
                borderColor: "var(--border)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    background: "var(--surface-2)",
                  }}
                >
                  <Icon
                    size={18}
                    style={{ color: "var(--primary)" }}
                  />
                </div>

                <div>
                  <p
                    className="text-[14px] font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </p>

                  <p
                    className="text-[13px] mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {item.value}
                  </p>
                </div>
              </div>

              <Badge variant="primary">
                {item.badge}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t"
        style={{
          borderColor: "var(--border)",
        }}
      >
        <div
          className="flex items-center gap-2 text-[13px]"
          style={{ color: "var(--text-muted)" }}
        >
          <Clock size={15} />
          Activity history is retained for security auditing.
        </div>

        {/*
          Was a button with no onClick — it rendered, looked live, and
          did nothing when clicked.

          Wrapped in <Can> because the audit log itself requires
          auditlog.view: without the guard this would have sent an
          ordinary employee to a tab that immediately 403s.
        */}
        {isParentCompany && (
          <Can permission="auditlog.view">
            <Link
              to="/settings?tab=audit"
              className="text-[13px] font-medium transition-colors hover:underline"
              style={{ color: "var(--primary)" }}
            >
              View Full Activity Log
            </Link>
          </Can>
        )}
      </div>
    </div>
  );
}