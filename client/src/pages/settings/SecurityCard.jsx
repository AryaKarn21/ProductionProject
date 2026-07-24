import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Shield, Lock, KeyRound, Clock, AlertTriangle, LogOut, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import Card, { CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { authAPI } from "@/api/auth.api";
import { useAuth } from "@/hooks/useAuth";

function SecurityRow({ icon: Icon, title, subtitle, right, onClick, clickable }) {
  const Wrapper = clickable ? "button" : "div";
  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-4 text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-5 w-5 shrink-0" style={{ color: "var(--text-muted)" }} />
        <div className="min-w-0">
          <p className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>{title}</p>
          {subtitle && <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        {right}
        {clickable && <ChevronRight className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
      </div>
    </Wrapper>
  );
}

export default function SecurityCard({ user }) {
  const { logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});

  const changePasswordMutation = useMutation({
    mutationFn: (data) => authAPI.changePassword(data),
    onSuccess: () => {
      toast.success("Password changed successfully");
      setModalOpen(false);
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    },
    onError: (err) => toast.error(err?.response?.data?.message || "Failed to change password"),
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.currentPassword) next.currentPassword = "Current password is required";
    if (!form.newPassword) next.newPassword = "New password is required";
    else if (form.newPassword.length < 8) next.newPassword = "Must be at least 8 characters";
    if (form.confirmPassword !== form.newPassword) next.confirmPassword = "Passwords don't match";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    changePasswordMutation.mutate({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
  };

  const isActive = user?.isActive !== false;

  return (
    <>
      <Card className="overflow-hidden h-full flex flex-col">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5" style={{ color: "var(--primary)" }} />
            <CardTitle>Security Center</CardTitle>
          </div>
          <CardDescription>Manage your account security.</CardDescription>
        </CardHeader>

        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          <SecurityRow
            icon={Shield}
            title="Account Status"
            subtitle={isActive ? "Your account is active." : "Your account is deactivated."}
            right={
              <Badge variant={isActive ? "success" : "danger"} dot>
                {isActive ? "Active" : "Inactive"}
              </Badge>
            }
          />

          <SecurityRow
            icon={Lock}
            title="Password"
            subtitle="Keep your password strong and unique."
            clickable
            onClick={() => setModalOpen(true)}
          />

          <SecurityRow
            icon={KeyRound}
            title="Two-Factor Authentication"
            subtitle="Add another layer of security."
            right={<Badge variant="gray">Coming Soon</Badge>}
          />

          <SecurityRow
            icon={Clock}
            title="Last Login"
            subtitle={user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}
          />
        </div>

        <div className="p-4 sm:p-6 space-y-4 border-t mt-auto" style={{ borderColor: "var(--border)" }}>
          <div className="rounded-lg border p-4" style={{ borderColor: "var(--warning)", background: "rgba(234,179,8,0.08)" }}>
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--warning)" }} />
              <div>
                <h4 className="font-medium text-[13px]" style={{ color: "var(--text-primary)" }}>Security Recommendation</h4>
                <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Change your password regularly and enable Two-Factor Authentication once available.
                </p>
              </div>
            </div>
          </div>

          <Button variant="destructive" className="w-full" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Change Password">
        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-1">
          <div>
            <Label required>Current Password</Label>
            <Input type="password" name="currentPassword" value={form.currentPassword} onChange={handleChange} />
            {errors.currentPassword && <p className="text-[12px] text-red-500 mt-1">{errors.currentPassword}</p>}
          </div>
          <div>
            <Label required>New Password</Label>
            <Input type="password" name="newPassword" value={form.newPassword} onChange={handleChange} />
            {errors.newPassword && <p className="text-[12px] text-red-500 mt-1">{errors.newPassword}</p>}
          </div>
          <div>
            <Label required>Confirm New Password</Label>
            <Input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} />
            {errors.confirmPassword && <p className="text-[12px] text-red-500 mt-1">{errors.confirmPassword}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={changePasswordMutation.isPending}>Update Password</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}