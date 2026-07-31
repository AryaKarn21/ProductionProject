import { NavLink } from "react-router-dom";
import {
  PenSquare,
  Inbox,
  Send,
  FileText,
  Star,
  Clock3,
  Archive,
  AlertCircle,
  Trash2,
  BarChart3,
  Settings,
  History,
  LayoutTemplate,
} from "lucide-react";

const menuItems = [
  {
    title: "Inbox",
    icon: Inbox,
    path: "/email/inbox",
    badge: 12,
  },
  {
    title: "Starred",
    icon: Star,
    path: "/email/starred",
  },
  {
    title: "Sent",
    icon: Send,
    path: "/email/sent",
  },
  {
    title: "Drafts",
    icon: FileText,
    path: "/email/drafts",
    badge: 3,
  },
  {
    title: "Scheduled",
    icon: Clock3,
    path: "/email/scheduled",
  },
  {
    title: "Archive",
    icon: Archive,
    path: "/email/archive",
  },
  {
    title: "Spam",
    icon: AlertCircle,
    path: "/email/spam",
  },
  {
    title: "Trash",
    icon: Trash2,
    path: "/email/trash",
  },
  {
    title: "History",
    icon: History,
    path: "/email/history",
  },
  {
    title: "Templates",
    icon: LayoutTemplate,
    path: "/email/templates",
  },
];

const bottomItems = [
  {
    title: "Analytics",
    icon: BarChart3,
    path: "/email/analytics",
  },
  {
    title: "Settings",
    icon: Settings,
    path: "/email/settings",
  },
];

export default function EmailSidebar() {
  return (
    <aside className="flex w-72 flex-col border-r bg-white dark:border-gray-800 dark:bg-gray-950">
      {/* Header */}
      <div className="border-b p-5 dark:border-gray-800">
        <NavLink
          to="/email/compose"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white transition hover:bg-blue-700"
        >
          <PenSquare size={18} />
          Compose
        </NavLink>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <div className="space-y-1 px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.title}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-lg px-4 py-3 transition ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                      : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} />
                  <span>{item.title}</span>
                </div>

                {item.badge && (
                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="border-t p-3 dark:border-gray-800">
        {bottomItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.title}
              to={item.path}
              className={({ isActive }) =>
                `mb-2 flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                  isActive
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`
              }
            >
              <Icon size={18} />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}