import Badge from '@/components/ui/Badge'
import { Users, Clock } from 'lucide-react'
import RoleActionsMenu from './RoleActionsMenu'
import { formatDate } from '@/lib/utils'

export default function RoleCard({
  role,
  onView,
  onEdit,
  onClone,
  onActivate,
  onDeactivate,
  onDelete,
  onRestore,
  onPermanentDelete,
  selected,
  onToggleSelect,
}) {
  const permissions =
    typeof role.permissions === "string"
      ? JSON.parse(role.permissions)
      : role.permissions || {};

  const enabledPermissions = Object.entries(permissions)
    .filter(([_, value]) => value)
    .map(([key]) => key);

  return (
    <div
      className="card p-4 sm:p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
      style={role.isDeleted ? { opacity: 0.6 } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0">
          {onToggleSelect && (
            <input
              type="checkbox"
              className="w-4 h-4 mt-1 rounded shrink-0"
              checked={!!selected}
              onChange={onToggleSelect}
              aria-label={`Select ${role.name}`}
            />
          )}
          <div className="min-w-0">
            <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {role.name}
            </p>
            {role.description && (
              <p className="text-[12px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                {role.description}
              </p>
            )}
          </div>
        </div>

        <RoleActionsMenu
          role={role}
          onView={() => onView(role)}
          onEdit={() => onEdit(role)}
          onClone={() => onClone(role)}
          onActivate={() => onActivate(role)}
          onDeactivate={() => onDeactivate(role)}
          onDelete={() => onDelete(role)}
          onRestore={() => onRestore(role)}
          onPermanentDelete={() => onPermanentDelete(role)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {enabledPermissions.length === 0 ? (
          <span
            className="text-[11px]"
            style={{ color: "var(--text-muted)" }}
          >
            No permissions assigned
          </span>
        ) : (
          enabledPermissions.map((permission) => (
            <span
              key={permission}
              className="px-2 py-1 text-[11px] rounded-md font-medium capitalize"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-secondary)",
              }}
            >
              {permission === "auditlog"
                ? "Audit Log"
                : permission.replace(/([A-Z])/g, " $1")}
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <Users size={13} />
          {role.userCount ?? 0} user{role.userCount === 1 ? '' : 's'}
        </div>

        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <Clock size={12} />
          {role.updatedAt ? formatDate(role.updatedAt) : '—'}
        </div>

        {role.isDeleted ? (
          <Badge variant="danger" dot>
            Trashed
          </Badge>
        ) : (
          <Badge variant={role.isActive ? 'success' : 'gray'} dot>
            {role.isActive ? 'Active' : 'Inactive'}
          </Badge>
        )}
      </div>
    </div>
  )
}