import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../config/db.js'

class AuditLog extends Model {}

AuditLog.init({
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  companyId:  { type: DataTypes.UUID, allowNull: true },
  userId:     { type: DataTypes.UUID, allowNull: true },
  action:     { type: DataTypes.STRING, allowNull: false },
  resource:   { type: DataTypes.STRING, allowNull: false },
  resourceId: { type: DataTypes.STRING },
  changes:    { type: DataTypes.JSON },
  ipAddress:  { type: DataTypes.STRING },

  // ──────────────────────────────────────────────────────────────
  // Columns below were being written by utils/audit.js and read by
  // routes/audit.routes.js, but were never declared on the model.
  // Sequelize silently dropped them on write, and any query that
  // filtered on `module` or `status` failed with "Unknown column".
  // ──────────────────────────────────────────────────────────────

  // Which functional area the event belongs to: 'settings', 'crm',
  // 'hr', 'finance'. Used by the audit dashboard's module chart.
  module:     { type: DataTypes.STRING, allowNull: true },

  // 'Desktop' | 'Mobile' | 'Tablet' — parsed from the User-Agent.
  device:     { type: DataTypes.STRING, allowNull: true },

  // 'Chrome' | 'Firefox' | 'Safari' | 'Edge' | 'Unknown'.
  browser:    { type: DataTypes.STRING, allowNull: true },

  // Did the audited action succeed or was it rejected? Failed logins
  // and denied permission checks are recorded with status 'failed'.
  status: {
    type: DataTypes.ENUM('success', 'failed'),
    defaultValue: 'success',
  },

  // Full raw User-Agent, kept for forensic use when the coarse
  // device/browser fields are not specific enough.
  userAgent:  { type: DataTypes.TEXT, allowNull: true },

  // Groups every audit row produced by a single login session so an
  // investigator can replay one session end to end.
  sessionId:  { type: DataTypes.STRING, allowNull: true },
}, {
  sequelize,
  modelName: 'AuditLog',
  tableName: 'audit_logs',
  timestamps: true,
  indexes: [
    { fields: ['companyId', 'createdAt'] },
    // The audit UI filters by user, action and resource. Without these
    // indexes each filter was a full table scan, which gets slow fast
    // on a table that only ever grows.
    { fields: ['userId', 'createdAt'] },
    { fields: ['action'] },
    { fields: ['resource', 'resourceId'] },
    { fields: ['module'] },
    { fields: ['status'] },
  ],
})

export default AuditLog