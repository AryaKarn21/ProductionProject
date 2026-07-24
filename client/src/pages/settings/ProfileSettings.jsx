import { useQuery } from "@tanstack/react-query";
import { authAPI } from "@/api/auth.api";

import ProfileHeader from "./ProfileHeader";
import AccountCard from "./AccountCard";
import EmployeeSummary from "./EmployeeSummary";
import SecurityCard from "./SecurityCard";
import PreferenceCard from "./PreferenceCard";
import NotificationCard from "./NotificationCard";
import ActivityCard from "./ActivityCard";

export default function ProfileSettings() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["profile"],
    // GET /auth/me responds with { user, companies, memberships }, not the
    // user record itself. Every card below (ProfileHeader, EmployeeSummary,
    // AccountCard, SecurityCard, ...) expects a flat user object, so the
    // nested `.user` must be unwrapped here. Without this, every field in
    // the whole page reads as undefined (blank name, blank avatar, "No
    // Company", employee summary stuck on "Not Assigned").
    queryFn: () => authAPI.getProfile().then((res) => res.data.user),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 border-4 rounded-full animate-spin"
          style={{ borderColor: "var(--border)", borderTopColor: "var(--primary)" }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
        <p className="text-[14px] font-medium" style={{ color: "var(--danger)" }}>
          Couldn't load your profile.
        </p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          Please refresh the page or try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
          Profile Settings
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Manage your account, security and preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 space-y-6">
          <ProfileHeader user={user} />
          <EmployeeSummary user={user} />
        </div>

        <div className="xl:col-span-2 space-y-6">
          <AccountCard user={user} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SecurityCard user={user} />
            <PreferenceCard user={user} />
          </div>

          <NotificationCard />
          <ActivityCard user={user} />
        </div>
      </div>
    </div>
  );
}