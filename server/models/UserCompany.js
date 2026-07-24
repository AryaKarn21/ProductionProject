import { DataTypes, Model } from 'sequelize'
import { sequelize } from '../config/db.js'

// Replaces Mongoose's User.companies: [ObjectId] array.
//
// This table is now the place where "which role does this user hold in
// this company?" is answered. Previously a user had exactly one roleId
// on the users table, which meant somebody who belongs to three
// companies was forced to have identical permissions in all three.
class UserCompany extends Model {}

UserCompany.init({
  // The table had no primary key at all, so nothing stopped the same
  // (userId, companyId) pair being inserted twice.
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },

  userId:    { type: DataTypes.UUID, allowNull: false },
  companyId: { type: DataTypes.UUID, allowNull: false },

  // The role this user holds *inside this specific company*. When null,
  // the resolver falls back to the user's home role (users.roleId), so
  // existing rows keep working exactly as they did before.
  roleId: {
    type: DataTypes.UUID,
    allowNull: true,
  },

  // Marks the user's default company — the one selected on login.
  isPrimary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },

  // Lets an administrator suspend somebody's access to one company
  // without removing them from it entirely.
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },

  // Who granted this membership — needed for the audit trail.
  assignedById: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  sequelize,
  modelName: 'UserCompany',
  tableName: 'user_companies',
  timestamps: true,
  indexes: [
    // Guarantees one membership row per user per company.
    { unique: true, fields: ['userId', 'companyId'], name: 'uq_user_company' },
    { fields: ['companyId'] },
    { fields: ['roleId'] },
  ],
})

export default UserCompany