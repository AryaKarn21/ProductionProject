import { DataTypes, Model } from "sequelize";
import bcrypt from "bcryptjs";
import { sequelize } from "../config/db.js";

class User extends Model {
  async comparePassword(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
  }

  // True when the account is temporarily locked after repeated failed
  // logins. Used by the login route to reject before hitting bcrypt.
  isLocked() {
    return !!(this.lockedUntil && this.lockedUntil > new Date());
  }

  toJSON() {
    const values = { ...this.get() };
    // Never let a password hash or an MFA secret leave the server, no
    // matter which route serialises the model.
    delete values.password;
    delete values.mfaSecret;
    return values;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      // Runs against the plaintext (Sequelize validates before the
      // beforeSave hook hashes), so this is a real minimum length.
      validate: { len: [8, 255] },
    },

    // Legacy coarse role. Still used by authorize() on a handful of
    // routes and for the super_admin bypass. New permission decisions
    // should go through roleId / Role.permissions instead.
    role: {
      type: DataTypes.ENUM(
        "super_admin",
        "admin",
        "manager",
        "employee",
        "accountant",
      ),
      defaultValue: "employee",
    },

    // The RBAC role. This is the user's *home* role; a per-company
    // override can be set on user_companies.roleId.
    roleId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // Was declared twice in the original file — kept once.
    phone: { type: DataTypes.STRING },

    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Was declared twice in the original file — kept once.
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    // PATCH /settings/users/:id/status was writing a `status` column
    // that did not exist, so the endpoint returned 200 and did nothing.
    // Declaring it makes the existing endpoint and the existing
    // UserList "Status" column work as written.
    status: {
      type: DataTypes.ENUM("active", "inactive", "suspended"),
      defaultValue: "active",
    },

    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    companyId: { type: DataTypes.UUID, allowNull: true }, // primary/home company
    lastLogin: { type: DataTypes.DATE },

    // ── Session invalidation ──────────────────────────────────────
    // Every issued JWT carries the tokenVersion it was signed with.
    // Bumping this number instantly invalidates every token already
    // in circulation for this user — which is what makes "log out
    // everywhere", forced logout, and password-change revocation work.
    tokenVersion: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },

    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // ── Brute-force protection ────────────────────────────────────
    failedLoginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },

    lockedUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // ── Reserved for the MFA work in a later phase ────────────────
    mfaEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    mfaSecret: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    timestamps: true,
    hooks: {
      beforeSave: async (user) => {
        if (user.changed("password")) {
          user.password = await bcrypt.hash(user.password, 12);

          // Stamp the change and invalidate existing sessions. Skipped
          // on the very first save so creating a user doesn't
          // immediately look like a password reset.
          if (!user.isNewRecord) {
            user.passwordChangedAt = new Date();
            user.tokenVersion = (user.tokenVersion || 0) + 1;
          }
        }
      },
    },
    indexes: [
      // Every tenant-scoped query filters on companyId, and protect()
      // joins on roleId on literally every request.
      { fields: ["companyId"] },
      { fields: ["roleId"] },
      { fields: ["isActive"] },
    ],
  },
);

export default User;