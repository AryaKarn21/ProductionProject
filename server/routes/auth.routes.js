import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs";
import { Op } from "sequelize";
import { User, Company, Employee, OTP, Role, UserCompany, PasswordResetToken } from "../models/index.js";
import { protect } from "../middleware/auth.js";
import { sendEmail } from "../services/email.services.js";
import { createOTP, verifyOTP } from "../services/otp.services.js";
import { createResetToken, verifyResetToken } from "../services/passwordReset.services.js";
import { loadTemplate } from "../utils/template.js";
import { logEvent, logFromRequest, getRequestMeta } from "../utils/audit.js";
import { resolveRolePermissions } from "../middleware/auth.js";
import { validate, rules } from "../middleware/validate.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Upload configuration
|--------------------------------------------------------------------------
| BUG FIX: `uploadDir` used to be declared inside the /register handler,
| but the multer `destination` callback below referenced it. That is a
| different scope, so every avatar upload threw
| "ReferenceError: uploadDir is not defined". Moving it to module scope
| makes avatar upload work for the first time.
*/
const uploadDir = path.join(process.cwd(), "uploads", "avatars");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    // Date.now() is guessable and collides under load. A random name
    // means an uploaded avatar cannot be found by walking timestamps.
    const safeExt = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${crypto.randomUUID()}${safeExt}`);
  },
});

const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter(req, file, cb) {
    if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WEBP and GIF images are allowed"));
    }
    cb(null, true);
  },
});

/*
|--------------------------------------------------------------------------
| Token helpers
|--------------------------------------------------------------------------
*/

// The token now carries the user's tokenVersion. protect() compares it
// against the database on every request, so bumping users.tokenVersion
// (on logout, password change, role change or suspension) invalidates
// every token already in circulation for that account. Previously
// logout did nothing at all and a stolen token stayed valid for 7 days.
const signToken = (user) =>
  jwt.sign(
    { id: user.id, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      algorithm: "HS256",
    }
  );

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Builds the login/refresh payload, including the permission list the
 * frontend needs to render menus and guard routes.
 */
const buildAuthPayload = async (user) => {
  const permissionSet = await resolveRolePermissions(user.roleId);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    role: user.role,
    roleId: user.roleId,
    roleInfo: user.roleInfo,
    companyId: user.companyId,
    // The Settings > Profile page (ProfileHeader "No Company" line and the
    // Employee Summary card) needs the home company's name and the linked
    // HR employee record, not just the raw companyId. Both are optional
    // associations — `company` is only present where it was eager-loaded
    // (see GET /me below), and `employee` is null for accounts with no HR
    // record.
    company: user.company
      ? { id: user.company.id, name: user.company.name }
      : null,
    employee: user.employee
      ? {
          id: user.employee.id,
          employeeId: user.employee.employeeId,
          department: user.employee.department,
          designation: user.employee.designation,
          joinDate: user.employee.joinDate,
          reportingManager: user.employee.reportingManager
            ? {
                id: user.employee.reportingManager.id,
                name: `${user.employee.reportingManager.firstName} ${user.employee.reportingManager.lastName}`.trim(),
              }
            : null,
        }
      : null,
    // Sent as an array of "module.action" strings — the same vocabulary
    // the server enforces against, so the UI and the API can no longer
    // disagree about what a user is allowed to do.
    permissions: [...permissionSet],
  };
};

/*
|--------------------------------------------------------------------------
| Registration
|--------------------------------------------------------------------------
|
| SECURITY: this endpoint used to be fully public. Anyone could create an
| account, verify their own email, and end up with a valid session and
| companyId = null — which was the first step of the tenant-pivot attack
| in the audit.
|
| It is now disabled by default. Set ALLOW_PUBLIC_REGISTRATION=true in
| .env only if you genuinely want open sign-up; administrators should
| create users through Settings -> Users instead.
*/
router.post(
  "/register",
  validate({
    name: rules.string({ required: true, min: 2, max: 120 }),
    email: rules.email({ required: true }),
    password: rules.password({ required: true, min: 8 }),
  }),
  async (req, res, next) => {
    try {
      if (process.env.ALLOW_PUBLIC_REGISTRATION !== "true") {
        return res.status(403).json({
          success: false,
          message:
            "Self-registration is disabled. Please ask an administrator to create your account.",
        });
      }

      const { name, email, password } = req.body;

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        // Same response either way so this cannot be used to discover
        // which email addresses have accounts.
        return res.status(202).json({
          success: true,
          message: "If that address can be registered, a verification code has been sent.",
        });
      }

      const user = await User.create({
        name,
        email,
        password,
        role: "employee",
        isVerified: false,
      });

      const otp = await createOTP(email);
      const html = loadTemplate("otp.html", { OTP: otp });

      await sendEmail({
        to: email,
        subject: "OS Group CRM - Verify Your Email",
        html,
      });

      await logEvent({
        userId: user.id,
        action: "user_registered",
        resource: "User",
        resourceId: user.id,
        module: "security",
        ...getRequestMeta(req),
      });

      res.status(201).json({
        success: true,
        message: "Registration successful. Please verify your email.",
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Login
|--------------------------------------------------------------------------
*/
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({
      where: { email },
      include: [
        { model: Company, as: "companies" },
        {
          model: Role,
          as: "roleInfo",
          attributes: ["id", "name", "permissions", "level", "isActive", "isDeleted"],
        },
        // The duplicate second `roleInfo` include that used to be here
        // has been removed.
      ],
    });

    const failLogin = async (reason, statusCode = 401, message = "Invalid email or password") => {
      await logEvent({
        userId: user?.id || null,
        companyId: user?.companyId || null,
        action: "login_failed",
        resource: "Auth",
        resourceId: email,
        module: "security",
        status: "failed",
        changes: { reason },
        ...getRequestMeta(req),
      });
      return res.status(statusCode).json({ message });
    };

    if (!user) return failLogin("unknown_email");

    // Account lockout. Without this the login endpoint accepted
    // unlimited password guesses.
    if (user.isLocked()) {
      const mins = Math.ceil((user.lockedUntil - new Date()) / 60000);
      return failLogin(
        "account_locked",
        423,
        `Too many failed attempts. Try again in ${mins} minute(s).`
      );
    }

    const passwordOk = await user.comparePassword(password);

    if (!passwordOk) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return failLogin("bad_password");
    }

    if (!user.isActive || user.status === "suspended") {
      return failLogin("account_inactive", 401, "Account has been deactivated");
    }

    if (!user.isVerified) {
      return failLogin(
        "email_unverified",
        401,
        "Please verify your email before logging in."
      );
    }

    if (user.roleInfo && (!user.roleInfo.isActive || user.roleInfo.isDeleted)) {
      return failLogin(
        "role_inactive",
        403,
        "Your assigned role is inactive. Please contact an administrator."
      );
    }

    // Successful login clears the failure counter.
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = signToken(user);

    await logEvent({
      userId: user.id,
      companyId: user.companyId,
      action: "login_success",
      resource: "Auth",
      resourceId: user.id,
      module: "security",
      status: "success",
      ...getRequestMeta(req),
    });

    res.json({
      token,
      user: await buildAuthPayload(user),
      companies: user.companies,
    });
  } catch (err) {
    next(err);
  }
});

/*
|--------------------------------------------------------------------------
| Session
|--------------------------------------------------------------------------
*/

/**
 * GET /api/auth/me
 *
 * The frontend defines authAPI.getProfile() but never called it, so
 * permissions were frozen in localStorage from login time — changing a
 * role had no effect until the user logged out. This now returns the
 * live permission list so the client can refresh on mount and on
 * window focus.
 */
router.get("/me", protect, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        { model: Company, as: "companies" },
        // Home company + linked HR employee record, both needed by the
        // Settings > Profile page. Neither was being loaded before, so
        // buildAuthPayload had nothing to read and the page showed
        // "No Company" / "Not Assigned" for every field.
        { model: Company, as: "company", attributes: ["id", "name"] },
        {
          model: Employee,
          as: "employee",
          attributes: [
            "id",
            "employeeId",
            "department",
            "designation",
            "joinDate",
          ],
          include: [
            {
              model: Employee,
              as: "reportingManager",
              attributes: ["id", "firstName", "lastName"],
            },
          ],
        },
        {
          model: Role,
          as: "roleInfo",
          attributes: ["id", "name", "permissions", "level"],
        },
        {
          model: UserCompany,
          as: "memberships",
          attributes: ["companyId", "roleId", "isPrimary"],
        },
      ],
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      user: await buildAuthPayload(user),
      companies: user.companies,
      memberships: user.memberships,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 *
 * Was a no-op that just returned a message, so a stolen token stayed
 * valid for its full 7-day lifetime. Bumping tokenVersion invalidates
 * every token issued for this account immediately.
 */
router.post("/logout", protect, async (req, res, next) => {
  try {
    await User.increment("tokenVersion", { where: { id: req.user.id } });

    await logFromRequest(req, {
      action: "logout",
      resource: "Auth",
      resourceId: req.user.id,
      module: "security",
    });

    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

/*
|--------------------------------------------------------------------------
| Profile
|--------------------------------------------------------------------------
| There were TWO `router.put("/profile")` handlers registered. Express
| only ever reaches the first, so the second was dead code. They are
| merged here into one.
|
| NOTE: the old handlers also assigned fields that do not exist on the
| User model (username, jobTitle, timezone, language, dob, gender,
| address, city, state, country, postalCode). Sequelize silently drops
| unknown attributes, so those never persisted — the endpoint looked
| like it worked but saved nothing. Only real columns are written now.
| If you want those fields, add them to models/User.js first.
*/
router.put(
  "/profile",
  protect,
  validate({
    name: rules.string({ min: 2, max: 120 }),
    email: rules.email(),
    phone: rules.string({ max: 30 }),
  }),
  async (req, res, next) => {
    try {
      const { name, email, phone } = req.body;

      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (email && email !== user.email) {
        const exists = await User.findOne({
          where: { email, id: { [Op.ne]: user.id } },
        });
        if (exists) {
          return res.status(409).json({ message: "Email already exists" });
        }
      }

      const before = { name: user.name, email: user.email, phone: user.phone };

      user.name = name ?? user.name;
      user.email = email ?? user.email;
      user.phone = phone ?? user.phone;

      await user.save();

      await logFromRequest(req, {
        action: "profile_updated",
        resource: "User",
        resourceId: user.id,
        module: "settings",
        changes: { before, after: { name: user.name, email: user.email, phone: user.phone } },
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
        user: await buildAuthPayload(user),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/auth/change-password
 *
 * The frontend has called authAPI.changePassword() all along, but this
 * endpoint did not exist — the request 404'd. Adding it.
 */
router.put(
  "/change-password",
  protect,
  validate({
    currentPassword: rules.string({ required: true, max: 255 }),
    newPassword: rules.password({ required: true, min: 8 }),
  }),
  async (req, res, next) => {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const ok = await user.comparePassword(req.body.currentPassword);
      if (!ok) {
        await logFromRequest(req, {
          action: "password_change_failed",
          resource: "User",
          resourceId: user.id,
          module: "security",
          status: "failed",
        });
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      if (req.body.currentPassword === req.body.newPassword) {
        return res
          .status(400)
          .json({ message: "New password must be different from the current one" });
      }

      // beforeSave hashes it and bumps tokenVersion, signing out every
      // other session including this one.
      user.password = req.body.newPassword;
      await user.save();

      await logFromRequest(req, {
        action: "password_changed",
        resource: "User",
        resourceId: user.id,
        module: "security",
      });

      // Hand back a fresh token so the current tab isn't logged out.
      res.json({
        success: true,
        message: "Password updated. All other sessions have been signed out.",
        token: signToken(user),
      });
    } catch (err) {
      next(err);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Avatar
|--------------------------------------------------------------------------
*/
router.post("/avatar", protect, upload.single("avatar"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Remove the previous file rather than accumulating orphans on disk.
    if (user.avatar) {
      const oldPath = path.join(process.cwd(), user.avatar.replace(/^\//, ""));
      if (oldPath.startsWith(uploadDir) && fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          /* non-fatal */
        }
      }
    }

    user.avatar = `/uploads/avatars/${req.file.filename}`;
    await user.save();

    res.json({ success: true, avatar: user.avatar });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/auth/avatar
 * The frontend calls authAPI.removeAvatar(); this endpoint was missing.
 */
router.delete("/avatar", protect, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.avatar) {
      const filePath = path.join(process.cwd(), user.avatar.replace(/^\//, ""));
      if (filePath.startsWith(uploadDir) && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* non-fatal */
        }
      }
    }

    user.avatar = null;
    await user.save();

    res.json({ success: true, message: "Avatar removed" });
  } catch (err) {
    next(err);
  }
});

/*
|--------------------------------------------------------------------------
| OTP — email verification
|--------------------------------------------------------------------------
*/

router.post("/send-otp", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ where: { email } });

    // Always answer the same way. The old version happily generated and
    // sent an OTP for any address, which confirmed whether an account
    // existed and let the endpoint be used to send mail to strangers.
    if (user) {
      const otp = await createOTP(email);
      const html = loadTemplate("otp.html", { OTP: otp });
      await sendEmail({
        to: email,
        subject: "OS Group CRM - Email Verification",
        html,
      });
    }

    res.json({
      success: true,
      message: "If that address is registered, a verification code has been sent.",
    });
  } catch (err) {
    next(err);
  }
});

router.post("/verify-otp", async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    await verifyOTP(email, otp);

    await User.update({ isVerified: true }, { where: { email } });

    await logEvent({
      action: "email_verified",
      resource: "Auth",
      resourceId: email,
      module: "security",
      ...getRequestMeta(req),
    });

    res.json({ success: true, message: "Email verified successfully" });
  } catch (err) {
    // verifyOTP throws plain Errors for expired/invalid/used codes.
    res.status(400).json({ success: false, message: err.message });
  }
});

/*
|--------------------------------------------------------------------------
| Password reset
|--------------------------------------------------------------------------
*/

router.post("/forgot-password", async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ where: { email } });

    // The old version returned 404 "User not found" for unknown
    // addresses, which is a user-enumeration oracle. Same answer either
    // way now.
    if (user) {
      const otp = await createOTP(email);

      // Also mint a single-use reset token. Your existing
      // services/passwordReset.services.js already does this properly —
      // it just was not being used.
      await createResetToken(email);

      const html = loadTemplate("otp.html", { OTP: otp });
      await sendEmail({
        to: email,
        subject: "OS Group CRM - Password Reset OTP",
        html,
      });

      await logEvent({
        userId: user.id,
        action: "password_reset_requested",
        resource: "Auth",
        resourceId: user.id,
        module: "security",
        ...getRequestMeta(req),
      });
    }

    res.json({
      success: true,
      message: "If that address is registered, a reset code has been sent.",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/reset-password
 *
 * SECURITY: the old check was
 *
 *     OTP.findOne({ where: { email, verified: true } })
 *
 * with no expiry check at all. Any verified OTP row — including one
 * created months earlier during signup — was a standing permission to
 * reset that account's password.
 *
 * Now the OTP must be verified AND unexpired AND is destroyed on use.
 * A `token` from the reset-token table is also accepted for callers
 * that use the link-based flow.
 */
router.post(
  "/reset-password",
  validate({
    email: rules.email({ required: true }),
    newPassword: rules.password({ required: true, min: 8 }),
    token: rules.string({ max: 128 }),
  }),
  async (req, res, next) => {
    try {
      const { email, newPassword, token } = req.body;

      let authorised = false;
      let otpRecord = null;

      if (token) {
        try {
          await verifyResetToken(email, token);
          authorised = true;
        } catch {
          authorised = false;
        }
      } else {
        otpRecord = await OTP.findOne({
          where: {
            email,
            verified: true,
            expiresAt: { [Op.gt]: new Date() }, // the missing expiry check
          },
        });
        authorised = !!otpRecord;
      }

      if (!authorised) {
        await logEvent({
          action: "password_reset_failed",
          resource: "Auth",
          resourceId: email,
          module: "security",
          status: "failed",
          changes: { reason: "no_valid_verification" },
          ...getRequestMeta(req),
        });
        return res.status(400).json({
          success: false,
          message: "Your verification code has expired. Please request a new one.",
        });
      }

      const user = await User.findOne({ where: { email } });
      if (!user) {
        // Do not confirm whether the account exists.
        return res.status(400).json({
          success: false,
          message: "Your verification code has expired. Please request a new one.",
        });
      }

      // beforeSave hashes and bumps tokenVersion, so every existing
      // session for this account is signed out.
      user.password = newPassword;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      await user.save();

      // Burn the credentials so they cannot be replayed.
      if (otpRecord) await otpRecord.destroy();
      await OTP.destroy({ where: { email } });
      await PasswordResetToken.destroy({ where: { email } });

      await logEvent({
        userId: user.id,
        action: "password_reset_completed",
        resource: "Auth",
        resourceId: user.id,
        module: "security",
        ...getRequestMeta(req),
      });

      res.json({ success: true, message: "Password reset successfully" });
    } catch (err) {
      next(err);
    }
  }
);

/*
|--------------------------------------------------------------------------
| REMOVED: GET /api/auth/test-email
|--------------------------------------------------------------------------
| That route was unauthenticated and sent mail on demand, so anyone on
| the internet could burn through your SMTP quota. If you need to test
| mail delivery, do it from a script or add it behind protect +
| authorize('super_admin').
*/

export default router;