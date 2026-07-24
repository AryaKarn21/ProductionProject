import express from "express";
import { Op } from "sequelize";
import {
  Employee,
  Payslip,
  Leave,
  Attendance,
  EmployeeDocument,
  Shift,
  PerformanceReview,
  AuditLog,
  DailyReport,
} from "../models/index.js";
import { protect, authorize } from "../middleware/auth.js";
import { createNotification } from "../services/notification.service.js";
import { logEvent } from "../utils/audit.js";
import { sendEmail } from "../services/email.services.js";
import multer from "multer";

const router = express.Router();
const getCompany = (req) => req.companyId;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// ── Zero-dependency CSV helpers (no new npm packages) ─────────
const CSV_COLUMNS = [
  "employeeId", "firstName", "lastName", "email", "phone",
  "department", "designation", "joinDate", "salary",
  "employmentType", "status",
];

const csvEscape = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const buildCSV = (rows) =>
  [
    CSV_COLUMNS.join(","),
    ...rows.map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n");

/*
|--------------------------------------------------------------------------
| GET /api/employees/picker
|--------------------------------------------------------------------------
| Slim list for the "Select Employee" dropdown in Settings -> Users -> Add User.
|
| Deliberately NOT a new resource — it reuses the Employee model and the
| tenant scope already applied by resolveCompany. It returns only the six
| fields the dropdown needs, so the picker does not ship salary, bank
| details and tax numbers to the browser the way GET /employees would.
|
| Query params:
|   companyId   optional. Super admins may target a specific company;
|               everyone else is pinned to their own by the check below.
|   unlinked    'true' (default) hides employees who already have a CRM
|               login, so you cannot create a second account for someone.
|   search      matches first name, last name, email or employee code.
|
| SECURITY: companyId from the query is never trusted on its own. A
| non-super-admin asking for another company gets 403.
*/
router.get("/picker", async (req, res, next) => {
  try {
    const requested = req.query.companyId;

    let companyId = req.companyId;

    if (requested) {
      const isMember =
        req.user.role === "super_admin" ||
        String(requested) === String(req.companyId) ||
        (req.memberships || []).some(
          (m) => String(m.companyId) === String(requested)
        );

      if (!isMember) {
        return res
          .status(403)
          .json({ message: "You do not have access to that company." });
      }
      companyId = requested;
    }

    if (!companyId) {
      return res.status(400).json({ message: "A company must be selected." });
    }

    const where = { companyId, status: "active" };

    // Only offer people who do not already have a CRM login.
    if (req.query.unlinked !== "false") {
      where.userId = null;
    }

    if (req.query.search) {
      const q = `%${req.query.search}%`;
      where[Op.or] = [
        { firstName: { [Op.like]: q } },
        { lastName: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { employeeId: { [Op.like]: q } },
      ];
    }

    const employees = await Employee.findAll({
      where,
      attributes: [
        "id",
        "employeeId",
        "firstName",
        "lastName",
        "email",
        "phone",
        "department",
        "designation",
        "userId",
      ],
      order: [
        ["firstName", "ASC"],
        ["lastName", "ASC"],
      ],
      limit: 500,
    });

    res.json({
      employees: employees.map((e) => ({
        id: e.id,
        employeeCode: e.employeeId,
        name: [e.firstName, e.lastName].filter(Boolean).join(" "),
        email: e.email,
        phone: e.phone,
        department: e.department,
        // The HR job title. This is NOT the CRM permission role — the two
        // are independent, so assigning a role never touches it.
        designation: e.designation,
        hasAccount: !!e.userId,
      })),
      total: employees.length,
    });
  } catch (err) {
    next(err);
  }
});

// RFC-4180-ish parser: handles quoted fields, embedded commas, escaped quotes, newlines.
const parseCSV = (text) => {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => x !== ""));
};

// Safe date/time formatters — NEVER call toISOString() on an invalid Date.
// (mysql2 returns TIME columns like "09:05:00" and can return "0000-00-00";
//  new Date(x).toISOString() throws "Invalid time value" on those.)
const fmtDate = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(0, 10);
};
const fmtTime = (d) => {
  if (!d) return "";
  if (typeof d === "string" && /^\d{1,2}:\d{2}/.test(d)) return d.slice(0, 5);
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString().slice(11, 16);
};
const fmtDateTime = (d) => {
  if (!d) return "";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
};

// ═════════════════════════════════════════════════════════════
// BULK EXPORT — must be declared BEFORE "/:id" or "export" reads as an :id
// ═════════════════════════════════════════════════════════════
router.get("/export", protect, async (req, res, next) => {
  try {
    const where = {};
    if (req.companyId) where.companyId = req.companyId;
    if (req.query.department) where.department = req.query.department;
    if (req.query.status) where.status = req.query.status;

    const employees = await Employee.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    const rows = employees.map((e) => ({
      employeeId: e.employeeId,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone,
      department: e.department,
      designation: e.designation,
      joinDate: fmtDate(e.joinDate),
      salary: e.salary,
      employmentType: e.employmentType,
      status: e.status,
    }));

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="employees-${Date.now()}.csv"`
    );
    res.send(buildCSV(rows));
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// BULK IMPORT — CSV with validation + duplicate checking
// ═════════════════════════════════════════════════════════════
router.post(
  "/import",
  protect,
  authorize("admin", "super_admin", "manager"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.companyId) {
        return res.status(400).json({ message: "Select a company before importing." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No CSV file uploaded." });
      }

      const parsed = parseCSV(req.file.buffer.toString("utf-8"));
      if (parsed.length < 2) {
        return res.status(400).json({ message: "CSV has no data rows." });
      }

      const header = parsed[0].map((h) => h.trim());
      const dataRows = parsed.slice(1);

      const required = ["employeeId", "firstName", "lastName", "email", "department", "designation", "joinDate", "salary"];
      const missingCols = required.filter((c) => !header.includes(c));
      if (missingCols.length) {
        return res.status(400).json({
          message: `CSV is missing required columns: ${missingCols.join(", ")}`,
        });
      }

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const report = { created: 0, skipped: 0, failed: 0, rows: [] };
      const seenInFile = new Set();

      for (let i = 0; i < dataRows.length; i++) {
        const rowNum = i + 2; // 1-based + header
        const rec = Object.fromEntries(header.map((h, idx) => [h, (dataRows[i][idx] ?? "").trim()]));

        const errors = [];
        for (const c of required) if (!rec[c]) errors.push(`${c} is required`);
        if (rec.email && !emailRe.test(rec.email)) errors.push("invalid email");
        if (rec.salary && Number.isNaN(Number(rec.salary))) errors.push("salary must be a number");

        if (errors.length) {
          report.failed++;
          report.rows.push({ row: rowNum, employeeId: rec.employeeId, status: "failed", errors });
          continue;
        }

        if (seenInFile.has(rec.employeeId) || seenInFile.has(rec.email)) {
          report.skipped++;
          report.rows.push({ row: rowNum, employeeId: rec.employeeId, status: "skipped", reason: "duplicate in file" });
          continue;
        }
        const existing = await Employee.findOne({
          where: {
            companyId: req.companyId,
            [Op.or]: [{ employeeId: rec.employeeId }, { email: rec.email }],
          },
        });
        if (existing) {
          report.skipped++;
          report.rows.push({ row: rowNum, employeeId: rec.employeeId, status: "skipped", reason: "already exists" });
          continue;
        }

        try {
          const created = await Employee.create({
            companyId: req.companyId,
            employeeId: rec.employeeId,
            firstName: rec.firstName,
            lastName: rec.lastName,
            email: rec.email,
            phone: rec.phone || null,
            department: rec.department,
            designation: rec.designation,
            joinDate: rec.joinDate,
            salary: Number(rec.salary),
            employmentType: rec.employmentType || "Full-Time",
            status: rec.status || "active",
          });
          seenInFile.add(rec.employeeId);
          seenInFile.add(rec.email);
          report.created++;
          report.rows.push({ row: rowNum, employeeId: rec.employeeId, status: "created" });

          await logEvent({
            companyId: req.companyId,
            userId: req.user.id,
            action: "employee_created",
            resourceId: created.id,
            changes: { via: "csv_import" },
          });
        } catch (e) {
          report.failed++;
          report.rows.push({ row: rowNum, employeeId: rec.employeeId, status: "failed", errors: [e.message] });
        }
      }

      res.json({ message: "Import complete", ...report });
    } catch (err) {
      next(err);
    }
  }
);

// ═════════════════════════════════════════════════════════════
// LIST
// ═════════════════════════════════════════════════════════════
router.get("/", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const {
      page = 1,
      limit = 20,
      search,
      department,
      status,
      sortKey = "createdAt",
      sortDir = "desc",
    } = req.query;
    const where = {};
    if (company) where.companyId = company;
    if (department) where.department = department;
    if (status) where.status = status;
    if (search)
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { employeeId: { [Op.like]: `%${search}%` } },
      ];
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: employees, count: total } = await Employee.findAndCountAll({
      where,
      order: [[sortKey || "createdAt", sortDir === "asc" ? "ASC" : "DESC"]],
      offset,
      limit: parseInt(limit),
    });
    res.json({ employees, total });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// GET ONE — includes reportingManager + shift for the detail header
// ═════════════════════════════════════════════════════════════
router.get("/:id", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
      include: [
        { model: Employee, as: "reportingManager", attributes: ["id", "firstName", "lastName", "designation"] },
        { model: Shift, as: "shift", attributes: ["id", "name"] },
      ],
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(employee);
  } catch (err) {
    console.error(err);
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// CREATE
// ═════════════════════════════════════════════════════════════
// ═════════════════════════════════════════════════════════════
// CREATE EMPLOYEE
// ═════════════════════════════════════════════════════════════
router.post("/", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);

    if (!company) {
      return res.status(400).json({
        message: "Company is required before creating an employee.",
      });
    }

    // Convert optional FK fields from "" to null
    const shiftId =
      typeof req.body.shiftId === "string" && req.body.shiftId.trim()
        ? req.body.shiftId.trim()
        : null;

    const reportingManagerId =
      typeof req.body.reportingManagerId === "string" &&
      req.body.reportingManagerId.trim()
        ? req.body.reportingManagerId.trim()
        : null;

    const userId =
      typeof req.body.userId === "string" && req.body.userId.trim()
        ? req.body.userId.trim()
        : null;

    // ---------------------------------------------------------
    // Validate selected shift
    // ---------------------------------------------------------
    if (shiftId) {
      const shift = await Shift.findOne({
        where: {
          id: shiftId,
          companyId: company,
        },
      });

      if (!shift) {
        return res.status(400).json({
          message: "Selected shift does not exist for this company.",
          field: "shiftId",
        });
      }
    }

    // ---------------------------------------------------------
    // Validate reporting manager
    // ---------------------------------------------------------
    if (reportingManagerId) {
      const manager = await Employee.findOne({
        where: {
          id: reportingManagerId,
          companyId: company,
        },
      });

      if (!manager) {
        return res.status(400).json({
          message: "Selected reporting manager does not exist.",
          field: "reportingManagerId",
        });
      }
    }

    // ---------------------------------------------------------
    // Generate next Employee ID
    // ---------------------------------------------------------
    const lastEmployee = await Employee.findOne({
      where: { companyId: company },
      order: [["createdAt", "DESC"]],
    });

    let employeeId = "EMP0001";

    if (lastEmployee?.employeeId) {
      const match = String(lastEmployee.employeeId).match(/^EMP(\d+)$/);

      if (match) {
        const lastNumber = Number(match[1]);

        employeeId = `EMP${String(lastNumber + 1).padStart(4, "0")}`;
      }
    }

    // ---------------------------------------------------------
    // Create Employee
    // ---------------------------------------------------------
    const employeeData = {
      ...req.body,

      companyId: company,
      employeeId,

      // IMPORTANT: use normalized FK values
      shiftId,
      reportingManagerId,
      userId,
    };

    const employee = await Employee.create(employeeData);

    // ---------------------------------------------------------
    // Notification
    // ---------------------------------------------------------
    await createNotification({
      companyId: employee.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "hr",
      type: "employee_created",

      title: "New Employee Added",

      message: `${employee.firstName} ${employee.lastName} has been added successfully.`,

      priority: "medium",

      actionUrl: `/hr/employees/${employee.id}`,

      metadata: {
        employeeId: employee.id,
      },
    });

    // ---------------------------------------------------------
    // Audit log
    // ---------------------------------------------------------
    await logEvent({
      companyId: employee.companyId,
      userId: req.user.id,

      action: "employee_created",

      resourceId: employee.id,

      changes: {
        employeeId: employee.employeeId,
        department: employee.department,
        designation: employee.designation,
      },
    });

    return res.status(201).json(employee);
  } catch (err) {
    console.error("CREATE EMPLOYEE ERROR:", {
      name: err.name,
      message: err.message,
      sqlMessage: err.parent?.sqlMessage,
      detail: err.parent?.detail,
      constraint: err.parent?.constraint,
      fields: err.fields,
    });

    next(err);
  }
});
// ═════════════════════════════════════════════════════════════
// UPDATE
// ═════════════════════════════════════════════════════════════
router.patch("/:id", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const before = {
      department: employee.department,
      salary: employee.salary,
      status: employee.status,
    };

    await employee.update(req.body);

    if (req.body.department !== undefined && req.body.department !== before.department) {
      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "department_changed",
        resourceId: employee.id,
        changes: { from: before.department, to: employee.department },
      });
    }

    if (req.body.salary !== undefined && Number(req.body.salary) !== Number(before.salary)) {
      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "salary_updated",
        resourceId: employee.id,
        changes: { from: before.salary, to: employee.salary },
      });
    }

    if (req.body.status !== undefined && req.body.status !== before.status) {
      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "employee_status_changed",
        resourceId: employee.id,
        changes: { from: before.status, to: employee.status },
      });
    }

    await createNotification({
      companyId: employee.companyId,
      userId: req.user.id,
      senderId: req.user.id,
      module: "hr",
      type: "employee_updated",
      title: "Employee Updated",
      message: `${employee.firstName} ${employee.lastName} has been updated successfully.`,
      priority: "medium",
      actionUrl: `/hr/employees/${employee.id}`,
      metadata: { employeeId: employee.id },
    });

    res.json(employee);
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// DELETE
// ═════════════════════════════════════════════════════════════
router.delete("/:id", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await createNotification({
      companyId: employee.companyId,
      userId: req.user.id,
      senderId: req.user.id,
      module: "hr",
      type: "employee_deleted",
      title: "Employee Removed",
      message: `${employee.firstName} ${employee.lastName} has been removed.`,
      priority: "low",
      metadata: { employeeId: employee.id },
    });

    await logEvent({
      companyId: employee.companyId,
      userId: req.user.id,
      action: "employee_deleted",
      resourceId: employee.id,
      changes: { employeeId: employee.employeeId },
    });

    await employee.destroy();

    res.json({ message: "Employee removed" });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// SEND EMAIL — routes through the server mailer (not a mailto link)
// ═════════════════════════════════════════════════════════════
router.post("/:id/send-email", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    if (!employee.email) {
      return res.status(400).json({ message: "This employee has no email address on file." });
    }

    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ message: "Subject and message are both required." });
    }

    const safe = String(message)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>");

    const html = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
        <p>Hi ${employee.firstName},</p>
        <div>${safe}</div>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
        <p style="font-size:12px;color:#888">Sent from ${req.user?.name || "HR"} · CRM</p>
      </div>`;

    await sendEmail({ to: employee.email, subject, html });

    try {
      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "email_sent",
        resourceId: employee.id,
        changes: { subject },
      });
    } catch (_) {}

    res.json({ message: "Email sent" });
  } catch (err) {
    console.error("[send-email] failed:", err.message);
    res.status(502).json({ message: "Could not send the email. Check the mail server settings." });
  }
});

// ═════════════════════════════════════════════════════════════
// PAYSLIPS
// ═════════════════════════════════════════════════════════════
router.get("/:id/payslips", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const payslips = await Payslip.findAll({
      where: { employeeId: employee.id, companyId: req.companyId },
      order: [["createdAt", "DESC"]],
    });

    res.json(payslips);
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// ATTENDANCE (last 30)
// ═════════════════════════════════════════════════════════════
router.get("/:id/attendance", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const attendance = await Attendance.findAll({
      where: { employeeId: employee.id, companyId: req.companyId },
      order: [["date", "DESC"]],
      limit: 30,
    });

    res.json({ attendance });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// LEAVES  (duplicate route removed — this is the single source)
// ═════════════════════════════════════════════════════════════
router.get("/:id/leaves", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const leaves = await Leave.findAll({
      where: { employeeId: employee.id, companyId: req.companyId },
      order: [["createdAt", "DESC"]],
    });

    res.json({ leaves });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// DOCUMENTS
// ═════════════════════════════════════════════════════════════
router.get("/:id/documents", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const documents = await EmployeeDocument.findAll({
      where: { employeeId: employee.id },
      order: [["uploadedAt", "DESC"]], // EmployeeDocument has timestamps:false — createdAt does NOT exist
    });

    res.json(documents);
  } catch (err) {
    next(err);
  }
});

router.post("/:id/documents", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ message: "Both name and url are required." });
    }

    const doc = await EmployeeDocument.create({
      employeeId: employee.id,
      name,
      url,
      uploadedAt: new Date(),
    });

    await logEvent({
      companyId: employee.companyId,
      userId: req.user.id,
      action: "document_uploaded",
      resourceId: employee.id,
      changes: { name },
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/documents/:docId", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const doc = await EmployeeDocument.findOne({
      where: { id: req.params.docId, employeeId: employee.id },
    });
    if (!doc) return res.status(404).json({ message: "Document not found" });

    await doc.destroy();
    res.json({ message: "Document removed" });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Quick Actions
// ─────────────────────────────────────────────────────────────
router.patch(
  "/:id/deactivate",
  protect,
  authorize("admin", "super_admin", "manager"),
  async (req, res, next) => {
    try {
      const employee = await Employee.findOne({
        where: { id: req.params.id, companyId: req.companyId },
      });
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      const nextStatus = req.body.status || "inactive";
      const prevStatus = employee.status;
      await employee.update({ status: nextStatus });

      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "employee_status_changed",
        resourceId: employee.id,
        changes: { from: prevStatus, to: nextStatus },
      });

      await createNotification({
        companyId: employee.companyId,
        userId: req.user.id,
        senderId: req.user.id,
        module: "hr",
        type: "employee_status_changed",
        title: nextStatus === "active" ? "Employee Reactivated" : "Employee Deactivated",
        message: `${employee.firstName} ${employee.lastName} is now ${nextStatus}.`,
        priority: "medium",
        actionUrl: `/hr/employees/${employee.id}`,
        metadata: { employeeId: employee.id },
      });

      res.json(employee);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id/assign-shift",
  protect,
  authorize("admin", "super_admin", "manager"),
  async (req, res, next) => {
    try {
      const { shiftId } = req.body;
      const employee = await Employee.findOne({
        where: { id: req.params.id, companyId: req.companyId },
      });
      if (!employee) return res.status(404).json({ message: "Employee not found" });

      const shift = await Shift.findByPk(shiftId);
      if (!shift) return res.status(404).json({ message: "Shift not found" });

      await employee.update({ shiftId });

      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "shift_assigned",
        resourceId: employee.id,
        changes: { shiftId, shiftName: shift.name },
      });

      res.json(employee);
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id/assign-manager",
  protect,
  authorize("admin", "super_admin", "manager"),
  async (req, res, next) => {
    try {
      const { reportingManagerId } = req.body;

      const employee = await Employee.findOne({
        where: { id: req.params.id, companyId: req.companyId },
      });
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }

      if (reportingManagerId === employee.id) {
        return res.status(400).json({ message: "Employee cannot report to themself" });
      }

      let managerName = null;
      if (reportingManagerId) {
        const manager = await Employee.findByPk(reportingManagerId);
        if (!manager) return res.status(404).json({ message: "Manager not found" });
        managerName = `${manager.firstName} ${manager.lastName}`;
      }

      await employee.update({ reportingManagerId: reportingManagerId || null });

      await logEvent({
        companyId: employee.companyId,
        userId: req.user.id,
        action: "manager_assigned",
        resourceId: employee.id,
        changes: { reportingManagerId, managerName },
      });

      res.json(employee);
    } catch (err) {
      next(err);
    }
  }
);

// ─────────────────────────────────────────────────────────────
// Timeline — reads back everything written via logEvent()
// ─────────────────────────────────────────────────────────────
router.get("/:id/timeline", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const { limit = 50 } = req.query;

    const logs = await AuditLog.findAll({
      where: {
        companyId: req.companyId,
        resource: "Employee",
        resourceId: String(employee.id),
      },
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
    });

    res.json({ timeline: logs });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Dashboard stats — feeds the Overview tab summary cards
// (now also returns leaveDays for the Attendance "Leave Days" card)
// ─────────────────────────────────────────────────────────────
router.get("/:id/dashboard-stats", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const attendanceThisMonth = await Attendance.findAll({
      where: {
        employeeId: employee.id,
        companyId: req.companyId,
        date: { [Op.gte]: monthStart },
      },
    });
    const present = attendanceThisMonth.filter((a) => a.status === "present").length;
    const absent = attendanceThisMonth.filter((a) => a.status === "absent").length;
    const late = attendanceThisMonth.filter((a) => a.status === "late").length;
    const halfDay = attendanceThisMonth.filter((a) => a.status === "half_day").length;
    const leaveDaysThisMonth = attendanceThisMonth.filter((a) => a.status === "leave" || a.status === "on_leave").length;
    const totalDays = attendanceThisMonth.length;
    const attendancePercentage = totalDays
      ? Math.round(((present + halfDay * 0.5) / totalDays) * 100)
      : 0;

    const leaves = await Leave.findAll({
      where: { employeeId: employee.id, companyId: req.companyId },
    });
    const leaveApproved = leaves.filter((l) => l.status === "approved").length;
    const leavePending = leaves.filter((l) => l.status === "pending").length;
    const leaveRejected = leaves.filter((l) => l.status === "rejected").length;

    const latestPayslip = await Payslip.findOne({
      where: { employeeId: employee.id, companyId: req.companyId },
      order: [["createdAt", "DESC"]],
    });

    const reviews = await PerformanceReview.findAll({
      where: { employeeId: employee.id, companyId: req.companyId },
    });
    const averageRating = reviews.length
      ? Math.round((reviews.reduce((s, r) => s + r.overallRating, 0) / reviews.length) * 100) / 100
      : 0;

    res.json({
      attendance: {
        present,
        absent,
        late,
        halfDay,
        leaveDays: leaveDaysThisMonth,
        totalDays,
        attendancePercentage,
      },
      leave: {
        total: leaves.length,
        approved: leaveApproved,
        pending: leavePending,
        rejected: leaveRejected,
      },
      payroll: latestPayslip
        ? { netPay: latestPayslip.netPay, period: latestPayslip.period }
        : null,
      performance: { averageRating, totalReviews: reviews.length },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Daily Reports — employee submits a daily work report
// ─────────────────────────────────────────────────────────────
router.get("/:id/daily-reports", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const reports = await DailyReport.findAll({
      where: { employeeId: employee.id, companyId: req.companyId },
      order: [["reportDate", "DESC"], ["createdAt", "DESC"]],
    });

    res.json({ reports });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/daily-reports", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const { reportDate, title, content, hoursSpent, blockers } = req.body;
    if (!content || !reportDate) {
      return res.status(400).json({ message: "Report date and content are required." });
    }

    const report = await DailyReport.create({
      companyId: employee.companyId,
      employeeId: employee.id,
      reportDate,
      title: title || null,
      content,
      hoursSpent: Number(hoursSpent) || 0,
      blockers: blockers || null,
      submittedById: req.user.id,
    });

    await logEvent({
      companyId: employee.companyId,
      userId: req.user.id,
      action: "daily_report_submitted",
      resourceId: employee.id,
      changes: { reportDate, title: title || "Daily report", hoursSpent: Number(hoursSpent) || 0 },
    });

    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id/daily-reports/:reportId", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const report = await DailyReport.findOne({
      where: { id: req.params.reportId, employeeId: employee.id, companyId: req.companyId },
    });
    if (!report) return res.status(404).json({ message: "Report not found" });

    await report.destroy();
    res.json({ message: "Report removed" });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// Full single-employee history → sectioned CSV download
// ─────────────────────────────────────────────────────────────
router.get("/:id/export", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.id, companyId: req.companyId },
      include: [
        { model: Employee, as: "reportingManager", attributes: ["firstName", "lastName"] },
        { model: Shift, as: "shift", attributes: ["name"] },
      ],
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const [attendance, leaves, payslips, reviews, documents, reports, timeline] = await Promise.all([
      Attendance.findAll({ where: { employeeId: employee.id, companyId: req.companyId }, order: [["date", "DESC"]] }),
      Leave.findAll({ where: { employeeId: employee.id, companyId: req.companyId }, order: [["startDate", "DESC"]] }),
      Payslip.findAll({ where: { employeeId: employee.id, companyId: req.companyId }, order: [["createdAt", "DESC"]] }),
      PerformanceReview.findAll({ where: { employeeId: employee.id, companyId: req.companyId }, order: [["reviewDate", "DESC"]] }),
      EmployeeDocument.findAll({ where: { employeeId: employee.id }, order: [["uploadedAt", "DESC"]] }),
      DailyReport.findAll({ where: { employeeId: employee.id, companyId: req.companyId }, order: [["reportDate", "DESC"]] }),
      AuditLog.findAll({
        where: { companyId: req.companyId, resource: "Employee", resourceId: String(employee.id) },
        order: [["createdAt", "DESC"]],
      }),
    ]);

    const section = (title, columns, rows) => {
      const lines = [`===== ${title} =====`];
      if (!rows || rows.length === 0) {
        lines.push("(no records)");
        return lines.join("\n");
      }
      lines.push(columns.map((c) => csvEscape(c.label)).join(","));
      for (const r of rows) lines.push(columns.map((c) => csvEscape(c.get(r))).join(","));
      return lines.join("\n");
    };

    const kvSection = (title, pairs) =>
      [`===== ${title} =====`, "Field,Value", ...pairs.map(([k, v]) => `${csvEscape(k)},${csvEscape(v)}`)].join("\n");

    const managerName = employee.reportingManager
      ? `${employee.reportingManager.firstName} ${employee.reportingManager.lastName}`
      : "";

    const blocks = [
      "FULL EMPLOYEE HISTORY EXPORT",
      `Generated,${new Date().toISOString()}`,
      "",
      kvSection("PROFILE", [
        ["Employee ID", employee.employeeId],
        ["First Name", employee.firstName],
        ["Last Name", employee.lastName],
        ["Email", employee.email],
        ["Phone", employee.phone],
        ["Department", employee.department],
        ["Designation", employee.designation],
        ["Status", employee.status],
        ["Employment Type", employee.employmentType],
        ["Shift", employee.shift?.name || ""],
        ["Reporting Manager", managerName],
        ["Work Location", employee.workLocation],
        ["Join Date", fmtDate(employee.joinDate)],
        ["Date of Birth", fmtDate(employee.dateOfBirth)],
        ["Gender", employee.gender],
        ["Nationality", employee.nationality],
        ["Address", employee.address],
        ["City", employee.city],
        ["Salary", employee.salary],
        ["Currency", employee.currency],
        ["Bank Name", employee.bankName],
        ["Account Number", employee.bankAccountNumber],
        ["PAN / Tax Number", employee.panTaxNumber],
      ]),
      "",
      section("ATTENDANCE", [
        { label: "Date", get: (r) => fmtDate(r.date) },
        { label: "Check In", get: (r) => fmtTime(r.checkIn) },
        { label: "Check Out", get: (r) => fmtTime(r.checkOut) },
        { label: "Hours", get: (r) => r.hoursWorked },
        { label: "Status", get: (r) => r.status },
      ], attendance),
      "",
      section("LEAVES", [
        { label: "Type", get: (r) => r.leaveType },
        { label: "Start", get: (r) => fmtDate(r.startDate) },
        { label: "End", get: (r) => fmtDate(r.endDate) },
        { label: "Days", get: (r) => r.days },
        { label: "Status", get: (r) => r.status },
        { label: "Reason", get: (r) => r.reason },
      ], leaves),
      "",
      section("PAYROLL", [
        { label: "Period", get: (r) => r.period },
        { label: "Basic", get: (r) => r.basicSalary },
        { label: "Allowances", get: (r) => r.allowances },
        { label: "Tax", get: (r) => r.tax },
        { label: "Deductions", get: (r) => r.deductions },
        { label: "Net Pay", get: (r) => r.netPay },
        { label: "Processed", get: (r) => fmtDate(r.processedAt) },
      ], payslips),
      "",
      section("PERFORMANCE", [
        { label: "Period", get: (r) => r.reviewPeriod },
        { label: "Date", get: (r) => fmtDate(r.reviewDate) },
        { label: "Overall", get: (r) => r.overallRating },
        { label: "Promotion Eligible", get: (r) => (r.promotionEligible ? "Yes" : "No") },
        { label: "Increment %", get: (r) => r.salaryIncrementRecommendation },
        { label: "Strengths", get: (r) => r.strengths },
        { label: "Areas to Improve", get: (r) => r.weaknesses },
        { label: "Manager Feedback", get: (r) => r.managerFeedback },
      ], reviews),
      "",
      section("DOCUMENTS", [
        { label: "Name", get: (r) => r.name },
        { label: "URL", get: (r) => r.url },
        { label: "Added", get: (r) => fmtDate(r.uploadedAt) },
      ], documents),
      "",
      section("DAILY REPORTS", [
        { label: "Date", get: (r) => fmtDate(r.reportDate) },
        { label: "Title", get: (r) => r.title },
        { label: "Hours", get: (r) => r.hoursSpent },
        { label: "Content", get: (r) => r.content },
        { label: "Blockers", get: (r) => r.blockers },
      ], reports),
      "",
      section("TIMELINE", [
        { label: "When", get: (r) => fmtDateTime(r.createdAt) },
        { label: "Event", get: (r) => r.action },
        { label: "Details", get: (r) => (r.changes ? JSON.stringify(r.changes) : "") },
      ], timeline),
    ];

    const csv = blocks.join("\n");
    const safeName = `${employee.firstName}-${employee.lastName}`.replace(/[^a-z0-9-]/gi, "");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}-full-history-${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;