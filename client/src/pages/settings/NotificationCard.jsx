import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Bell,
  Mail,
  Monitor,
  Volume2,
  Calendar,
  Users,
  DollarSign,
  Boxes,
  ShoppingCart,
  FolderKanban,
  LifeBuoy,
  Save,
} from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import Card, { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { notificationsAPI } from "@/api/notifications.api";

const ROWS = [
  { key: "emailEnabled", icon: Mail, title: "Email Notifications", description: "Receive updates by email." },
  { key: "browserEnabled", icon: Monitor, title: "Browser Notifications", description: "Desktop browser alerts." },
  { key: "soundEnabled", icon: Volume2, title: "Notification Sound", description: "Play a sound for new notifications." },
  { key: "meetingNotifications", icon: Calendar, title: "Meetings", description: "Upcoming meeting reminders." },
  { key: "hrNotifications", icon: Users, title: "HR & Leave", description: "Leave requests and approvals." },
  { key: "financeNotifications", icon: DollarSign, title: "Finance & Payroll", description: "Salary and payroll updates." },
  { key: "crmNotifications", icon: Bell, title: "CRM", description: "Leads, deals, and contact updates." },
  { key: "inventoryNotifications", icon: Boxes, title: "Inventory", description: "Stock and asset updates." },
  { key: "procurementNotifications", icon: ShoppingCart, title: "Procurement", description: "Purchase orders and vendors." },
  { key: "projectNotifications", icon: FolderKanban, title: "Projects", description: "Task and project updates." },
  { key: "supportNotifications", icon: LifeBuoy, title: "Support", description: "Ticket updates and replies." },
];

const DEFAULTS = ROWS.reduce((acc, r) => ({ ...acc, [r.key]: true }), {});

function NotificationRow({ icon: Icon, title, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border p-3 sm:p-4" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-start gap-3 sm:gap-4 min-w-0">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
        <div className="min-w-0">
          <h4 className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{title}</h4>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{description}</p>
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} className="shrink-0" />
    </div>
  );
}

export default function NotificationCard() {
  const [notifications, setNotifications] = useState(DEFAULTS);
  const queryClient = useQueryClient();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => (await notificationsAPI.getPreferences()).data,
  });

  useEffect(() => {
    if (prefs) setNotifications({ ...DEFAULTS, ...prefs });
  }, [prefs]);

  const saveMutation = useMutation({
    mutationFn: (data) => notificationsAPI.updatePreferences(data),
    onSuccess: () => {
      toast.success("Notification preferences saved");
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to save preferences"),
  });

  const toggle = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(notifications);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" style={{ color: "var(--primary)" }} />
          <CardTitle>Notification Preferences</CardTitle>
        </div>
        <CardDescription>Choose how you'd like to receive important CRM notifications.</CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div
              className="w-7 h-7 border-4 rounded-full animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ROWS.map((row) => (
                <NotificationRow
                  key={row.key}
                  icon={row.icon}
                  title={row.title}
                  description={row.description}
                  checked={!!notifications[row.key]}
                  onChange={() => toggle(row.key)}
                />
              ))}
            </div>

            <div className="flex justify-end pt-4 border-t" style={{ borderColor: "var(--border)" }}>
              <Button type="submit" loading={saveMutation.isPending}>
                <Save className="mr-2 h-4 w-4" />
                Save Preferences
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}