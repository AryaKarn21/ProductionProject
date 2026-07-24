import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import FormModal from "@/components/shared/FormModal";
import PermissionGroup from "./PermissionGroup";
import { PERMISSION_MODULES, ALL_PERMISSION_KEYS } from "./roles/permissionMeta";
import { settingsAPI } from "@/api/settings.api";
import { rolesAPI } from "@/api/roles.api";
import usePermission from "@/hooks/usePermission";
import { useAuthStore } from "@/store/auth.store";

import {
  LayoutDashboard,
  Briefcase,
  Users,
  Wallet,
  Package,
  Boxes,
  FolderKanban,
  LifeBuoy,
  Settings,
  Building2,
  GitBranch,
} from "lucide-react";

const MODULE_ICONS = {
  dashboard: <LayoutDashboard size={18} />,
  crm: <Briefcase size={18} />,
  hr: <Users size={18} />,
  finance: <Wallet size={18} />,
  inventory: <Package size={18} />,
  assets: <Boxes size={18} />,
  projects: <FolderKanban size={18} />,
  support: <LifeBuoy size={18} />,
  settings: <Settings size={18} />,
};

/*
|--------------------------------------------------------------------------
| RoleFormModal
|--------------------------------------------------------------------------
|
| Adds two selectors the form was missing:
|
|   1. COMPANY — a role belongs to exactly one company. The server always
|      set it from req.companyId, so a super admin working across
|      companies had no way to say which tenant a new role was for.
|
|   2. INHERITS FROM — an optional parent role. A child role gets every
|      permission its parent grants, so you can build
|      "Sales Rep -> Sales Manager -> Sales Director" without re-ticking
|      the same boxes three times.
|
| Company rules:
|   - super_admin  : may pick any company
|   - everyone else: locked to their own, so an admin of Company A
|                    cannot create a role inside Company B
*/
export default function RoleFormModal({
  open,
  onClose,
  register,
  handleSubmit,
  onSubmit,
  loading,
  watch,
  setValue,
  mode = "create",
  editingRoleId = null,
}) {
  const { isSuperAdmin } = usePermission();
  const activeCompany = useAuthStore((s) => s.activeCompany);

  const allValues = ALL_PERMISSION_KEYS.map((key) => watch?.(`permissions.${key}`));
  const allSelected = allValues.length > 0 && allValues.every(Boolean);

  const handleSelectAll = () => {
    if (!setValue) return;
    const next = !allSelected;
    ALL_PERMISSION_KEYS.forEach((key) => setValue(`permissions.${key}`, next));
  };

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => settingsAPI.getCompanies().then((r) => r.data),
    enabled: open,
  });

  const selectedCompany = watch?.("companyId");

  // Anyone who is not a super admin creates roles in their own company.
  useEffect(() => {
    if (!open || !setValue) return;
    if (!isSuperAdmin && activeCompany) setValue("companyId", activeCompany);
  }, [open, isSuperAdmin, activeCompany, setValue]);

  // Possible parents: active roles in the same company, minus this role
  // itself (a role cannot inherit from itself).
  const { data: rolesData } = useQuery({
    queryKey: ["roles", "parents", selectedCompany],
    queryFn: () => rolesAPI.getAll({ status: "active", limit: 100 }).then((r) => r.data),
    enabled: open,
  });

  const parentOptions = (rolesData?.roles || []).filter(
    (r) =>
      String(r.id) !== String(editingRoleId) &&
      (!selectedCompany || String(r.companyId) === String(selectedCompany))
  );

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit Role" : "Create Role"}
      onSubmit={handleSubmit(onSubmit)}
      loading={loading}
      submitLabel={mode === "edit" ? "Save Changes" : "Create Role"}
      size="xl"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Role Name *</label>
            <input className="input" placeholder="Sales Manager" {...register("name")} />
          </div>
          <div>
            <label className="form-label">Description</label>
            <input
              className="input"
              placeholder="Role description"
              {...register("description")}
            />
          </div>
        </div>

        {/* ── Company & inheritance ────────────────────────── */}
        <div
          className="grid grid-cols-2 gap-4 rounded-lg border p-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <label className="form-label">
              <span className="inline-flex items-center gap-1">
                <Building2 size={13} /> Company *
              </span>
            </label>
            <select
              className="input"
              disabled={!isSuperAdmin || mode === "edit"}
              {...register("companyId")}
            >
              <option value="">Select a company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {mode === "edit"
                ? "A role cannot be moved between companies."
                : isSuperAdmin
                  ? "This role will only be assignable to users in this company."
                  : "Roles are created inside your own company."}
            </p>
          </div>

          <div>
            <label className="form-label">
              <span className="inline-flex items-center gap-1">
                <GitBranch size={13} /> Inherits From
              </span>
            </label>
            <select className="input" {...register("parentRoleId")}>
              <option value="">None — standalone role</option>
              {parentOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Everything the parent grants is inherited, plus whatever you tick below.
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Permissions</h2>
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-blue-600 text-sm hover:underline"
          >
            {allSelected ? "Unselect All" : "Select All"}
          </button>
        </div>

        {PERMISSION_MODULES.map((mod) => (
          <PermissionGroup
            key={mod.key}
            title={mod.title}
            icon={MODULE_ICONS[mod.key]}
            permissions={mod.permissions.map((p) => p.key)}
            labels={Object.fromEntries(mod.permissions.map((p) => [p.key, p.label]))}
            register={register}
            watch={watch}
            setValue={setValue}
          />
        ))}
      </div>
    </FormModal>
  );
}