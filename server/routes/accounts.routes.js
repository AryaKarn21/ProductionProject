import express from "express";
import { Op } from "sequelize";
import { Account, Contact, Opportunity, User } from "../models/index.js";
import { authorizePermission, protect } from "../middleware/auth.js";
import { createNotification } from "../services/notification.service.js";

import multer from "multer";
import { findInScope } from '../utils/scope.js'
const uploadAccountsCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const router = express.Router();

router.get("/", protect, authorizePermission("accounts.view"), async (req, res, next) => {
  try {
    const company = req.companyId;
    const {
      page = 1,
      limit = 20,
      search,
      type,
      sortKey = "createdAt",
      sortDir = "desc",
    } = req.query;
    const where = {};
    if (company) where.companyId = company;
    if (type) where.type = type;
    if (search)
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: accounts, count: total } = await Account.findAndCountAll({
      where,
      order: [[sortKey, sortDir === "asc" ? "ASC" : "DESC"]],
      offset,
      limit: parseInt(limit),
      include: [{ model: User, as: "assignedTo", attributes: ["id", "name"] }],
    });
    res.json({ accounts, total });
  } catch (err) {
    next(err);
  }
});
// ── CSV helpers (zero dependencies) ──────────────────────────
const CSV_COLUMNS = [
  "accountNumber", "name", "industry", "type", "status",
  "email", "phone", "mobile", "website",
  "annualRevenue", "employees", "currency",
  "billingStreet", "billingCity", "billingState", "billingCountry", "billingZip",
  "taxNumber", "gstNumber", "description",
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

// Blank -> null so Sequelize validators (isEmail) don't reject "".
const blankToNull = (v) => (v === "" || v === undefined ? null : v);
const toNumber = (v) => (v === "" || v == null ? null : Number(v));

// ═════════════════════════════════════════════════════════════
// EXPORT — must be declared BEFORE "/:id" or "export" reads as an :id
// ═════════════════════════════════════════════════════════════
router.get("/export", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const where = {};
    if (req.companyId) where.companyId = req.companyId;
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.industry) where.industry = req.query.industry;

    const accounts = await Account.findAll({ where, order: [["createdAt", "DESC"]] });

    const rows = accounts.map((a) => {
      const out = {};
      for (const col of CSV_COLUMNS) out[col] = a[col];
      return out;
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="accounts-${Date.now()}.csv"`);
    res.send(buildCSV(rows));
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════════
// IMPORT — validates + de-duplicates each row; one bad row never
// aborts the batch. Returns a row-by-row report.
// ═════════════════════════════════════════════════════════════
router.post("/import", protect, authorizePermission('accounts.view'), uploadAccountsCsv.single("file"), async (req, res, next) => {
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
    if (!header.includes("name")) {
      return res.status(400).json({ message: 'CSV must include a "name" column.' });
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const report = { created: 0, skipped: 0, failed: 0, rows: [] };
    const seen = new Set();

    for (let i = 0; i < parsed.length - 1; i++) {
      const rowNum = i + 2;
      const rec = Object.fromEntries(header.map((h, idx) => [h, (parsed[i + 1][idx] ?? "").trim()]));

      const errors = [];
      if (!rec.name) errors.push("name is required");
      if (rec.email && !emailRe.test(rec.email)) errors.push("invalid email");
      if (rec.annualRevenue && Number.isNaN(Number(rec.annualRevenue))) errors.push("annualRevenue must be a number");
      if (rec.employees && Number.isNaN(Number(rec.employees))) errors.push("employees must be a number");

      if (errors.length) {
        report.failed++;
        report.rows.push({ row: rowNum, name: rec.name, status: "failed", errors });
        continue;
      }

      const key = (rec.accountNumber || rec.name).toLowerCase();
      if (seen.has(key)) {
        report.skipped++;
        report.rows.push({ row: rowNum, name: rec.name, status: "skipped", reason: "duplicate in file" });
        continue;
      }

      const orClauses = [{ name: rec.name }];
      if (rec.accountNumber) orClauses.push({ accountNumber: rec.accountNumber });
      const existing = await Account.findOne({
        where: { companyId: req.companyId, [Op.or]: orClauses },
      });
      if (existing) {
        report.skipped++;
        report.rows.push({ row: rowNum, name: rec.name, status: "skipped", reason: "already exists" });
        continue;
      }

      try {
        await Account.create({
          companyId: req.companyId,
          createdBy: req.user.id,
          updatedBy: req.user.id,
          accountNumber: blankToNull(rec.accountNumber),
          name: rec.name,
          industry: blankToNull(rec.industry),
          type: blankToNull(rec.type) || "Customer",
          status: blankToNull(rec.status) || "Active",
          email: blankToNull(rec.email),
          phone: blankToNull(rec.phone),
          mobile: blankToNull(rec.mobile),
          website: blankToNull(rec.website),
          annualRevenue: toNumber(rec.annualRevenue) ?? 0,
          employees: toNumber(rec.employees),
          currency: blankToNull(rec.currency) || "NPR",
          billingStreet: blankToNull(rec.billingStreet),
          billingCity: blankToNull(rec.billingCity),
          billingState: blankToNull(rec.billingState),
          billingCountry: blankToNull(rec.billingCountry),
          billingZip: blankToNull(rec.billingZip),
          taxNumber: blankToNull(rec.taxNumber),
          gstNumber: blankToNull(rec.gstNumber),
          description: blankToNull(rec.description),
        });
        seen.add(key);
        report.created++;
        report.rows.push({ row: rowNum, name: rec.name, status: "created" });
      } catch (e) {
        report.failed++;
        report.rows.push({ row: rowNum, name: rec.name, status: "failed", errors: [e.message] });
      }
    }

    res.json({ message: "Import complete", ...report });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const account = await findInScope(req, Account, req.params.id, {
      include: [{ model: User, as: "assignedTo", attributes: ["id", "name"] }],
    });
    if (!account) return res.status(404).json({ message: "Account not found" });
    res.json(account);
  } catch (err) {
    next(err);
  }
});
router.post("/", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const account = await Account.create({
      ...req.body,
      companyId: req.companyId,
    });

    await createNotification({
      companyId: account.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "crm",
      type: "account_created",

      title: "New Account Created",

      message: `${account.name} has been created successfully.`,

      priority: "medium",

      actionUrl: `/crm/accounts/${account.id}`,

      metadata: {
        accountId: account.id,
      },
    });

    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});
console.log("Assignment notification created.");
router.patch("/:id", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const account = await findInScope(req, Account, req.params.id);

    if (!account) {
      return res.status(404).json({
        message: "Account not found",
      });
    }

    const previousAssignee = account.assignedToId;

    await account.update(req.body);

    // Account Assigned
    if (req.body.assignedToId && req.body.assignedToId !== previousAssignee) {
      await createNotification({
        companyId: account.companyId,
        userId: req.body.assignedToId,
        senderId: req.user.id,

        module: "crm",
        type: "account_assigned",

        title: "Account Assigned",

        message: `${account.name} has been assigned to you.`,

        priority: "high",

        actionUrl: `/crm/accounts/${account.id}`,

        metadata: {
          accountId: account.id,
        },
      });
    }

    console.log("Previous Assignee:", previousAssignee);
    console.log("New Assignee:", req.body.assignedToId);

    // Account Updated
    await createNotification({
      companyId: account.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "crm",
      type: "account_updated",

      title: "Account Updated",

      message: `${account.name} has been updated successfully.`,

      priority: "medium",

      actionUrl: `/crm/accounts/${account.id}`,

      metadata: {
        accountId: account.id,
      },
    });

    res.json(account);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const account = await findInScope(req, Account, req.params.id);

    if (!account) {
      return res.status(404).json({
        message: "Account not found",
      });
    }

    await createNotification({
      companyId: account.companyId,
      userId: req.user.id,
      senderId: req.user.id,

      module: "crm",
      type: "account_deleted",

      title: "Account Deleted",

      message: `${account.name} has been deleted successfully.`,

      priority: "medium",

      metadata: {
        accountId: account.id,
      },
    });

    await account.destroy();

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/contacts", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const contacts = await Contact.findAll({
      where: { accountId: req.params.id },
    });
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/opportunities", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  try {
    const opportunities = await Opportunity.findAll({
      where: { accountId: req.params.id },
    });
    res.json({ opportunities });
  } catch (err) {
    next(err);
  }
});

router.get("/:id/timeline", protect, authorizePermission('accounts.view'), async (req, res, next) => {
  res.json({ items: [] });
});

export default router;
