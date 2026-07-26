import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/db.js";

class EmailAccount extends Model {}

EmailAccount.init(
  {
    id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    companyId:       { type: DataTypes.UUID, allowNull: false },
    createdBy:       { type: DataTypes.UUID, allowNull: true },
    updatedBy:       { type: DataTypes.UUID, allowNull: true },
    userId:          { type: DataTypes.UUID, allowNull: false }, // account owner
    provider:        { type: DataTypes.ENUM("gmail", "outlook", "microsoft365", "smtp", "imap"), allowNull: false },
    authType:        { type: DataTypes.ENUM("oauth2", "password"), defaultValue: "password" },
    email:           { type: DataTypes.STRING, allowNull: false },
    displayName:     { type: DataTypes.STRING },
    // Google's stable user id ("sub"), set when the mailbox is connected via
    // Google OAuth. Null for legacy SMTP/app-password accounts.
    googleId:        { type: DataTypes.STRING, allowNull: true },
    // Credentials are AES-256-GCM encrypted before being stored (see utils/crypto.js).
    // For OAuth2 accounts encRefreshToken is the long-lived secret; encPassword is unused.
    encAccessToken:  { type: DataTypes.TEXT },
    encRefreshToken: { type: DataTypes.TEXT },
    encPassword:     { type: DataTypes.TEXT },
    tokenExpiresAt:  { type: DataTypes.DATE },
    smtpHost:        { type: DataTypes.STRING },
    smtpPort:        { type: DataTypes.INTEGER },
    smtpSecure:      { type: DataTypes.BOOLEAN, defaultValue: true },
    imapHost:        { type: DataTypes.STRING },
    imapPort:        { type: DataTypes.INTEGER },
    imapSecure:      { type: DataTypes.BOOLEAN, defaultValue: true },
    status:          { type: DataTypes.ENUM("active", "error", "disconnected"), defaultValue: "active" },
    syncEnabled:     { type: DataTypes.BOOLEAN, defaultValue: true },
    lastSyncedAt:    { type: DataTypes.DATE },
    lastError:       { type: DataTypes.TEXT },
    isDefault:       { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize, modelName: "EmailAccount", tableName: "email_accounts",
    timestamps: true, paranoid: true, // paranoid => soft delete via deletedAt
    indexes: [
      { fields: ["companyId", "userId"] },
      { fields: ["companyId", "status"] },
      { fields: ["email"] },
    ],
  }
);

export default EmailAccount;