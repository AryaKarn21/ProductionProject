import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../config/db.js'

class Role extends Model {}

Role.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    companyId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
    },

    // Permission grants, stored as { "leads.view": true, "leads.delete": false }.
    //
    // The old flat format { "leads": true } is still accepted and is
    // expanded to every action on that module at read time by
    // config/permissions.js -> normalizePermissions(). That means
    // existing roles in your database keep behaving exactly as they do
    // today, and you can migrate them at your own pace.
    permissions: {
      type: DataTypes.JSON,
      defaultValue: {},
    },

    // ── Role hierarchy ────────────────────────────────────────────
    // A child role inherits every permission its parent grants. Used
    // by resolveRolePermissions() so you can build "Sales Rep ->
    // Sales Manager -> Sales Director" without re-ticking boxes.
    parentRoleId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // Seniority. A user may only create or edit roles at a *lower*
    // level than their own, which stops a mid-level admin from
    // minting a role more powerful than themselves.
    level: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },

    // Built-in roles seeded by the system. These cannot be deleted or
    // renamed, so an administrator can't lock everyone out by
    // trashing the role their own account depends on.
    isSystem: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    // ── Role lifecycle management ─────────────────────────────────
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Audit breadcrumbs.
    createdById: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    updatedById: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    timestamps: true,
    indexes: [
      { fields: ['companyId', 'isDeleted'] },
      { fields: ['parentRoleId'] },

      // ──────────────────────────────────────────────────────────
      // NOTE — role name uniqueness is enforced in the application,
      // not here, and deliberately so.
      //
      // A database-level UNIQUE (companyId, name) has two problems
      // with this schema:
      //
      //   1. Roles are soft-deleted. A trashed "Manager" would
      //      permanently reserve that name — you could never create
      //      a new Manager role again.
      //
      //   2. MySQL cannot scope a unique index to "rows where
      //      isDeleted = false". Postgres has partial indexes;
      //      MySQL does not.
      //
      // roles.routes.js therefore checks for a name collision among
      // NON-deleted roles in the same company before create and
      // update, which gives the same guarantee without the
      // soft-delete trap.
      // ──────────────────────────────────────────────────────────
    ],
  }
)

export default Role