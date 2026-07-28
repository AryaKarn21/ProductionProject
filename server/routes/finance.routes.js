import express from "express";
import { Op, fn, col } from "sequelize";
import { Expense, LedgerEntry, User, Company } from "../models/index.js";
import { protect } from "../middleware/auth.js";
import uploadReceipt from "../middleware/uploadReceipt.js";
import Notification from "../models/Notification.js";
import { generateExpensePDF } from "../reports/expenseReport.js";
import fs from "fs";
import path from "path";
import multer from "multer";
import { findInScope } from '../utils/scope.js'

const router = express.Router();
const getCompany = (req) => req.companyId;

// Declared once, at module scope — usable by any route below.
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── CSV helpers ───────────────────────────────────────────
function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) { result.push(current); current = ""; }
    else current += char;
  }
  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (values[i] ?? "").trim()));
    return row;
  });
}

function toCSVValue(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCSV(headers, rows) {
  return [headers, ...rows].map((r) => r.map(toCSVValue).join(",")).join("\n");
}

// ── Expenses: list ───────────────────────────────────────
router.get("/expenses", protect, async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const { page = 1, limit = 20, search = "", category, status } = req.query;

    const where = { companyId };
    if (search) where.title = { [Op.like]: `%${search}%` };
    if (category) where.category = category;
    if (status) where.status = status;

    const { rows, count } = await Expense.findAndCountAll({
      where,
      include: [{ model: User, as: "submittedBy", attributes: ["id", "name", "email"] }],
      order: [["date", "DESC"]],
      limit: Number(limit),
      offset: (page - 1) * limit,
    });

    res.json({ expenses: rows, total: count });
  } catch (err) {
    next(err);
  }
});

// ── Export ──────────────────────────────────────────────
router.get("/export", protect, async (req, res, next) => {
  try {
    const company = req.companyId;
    const { type = "expenses", startDate, endDate } = req.query;
    const where = { companyId: company };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = new Date(startDate);
      if (endDate) where.date[Op.lte] = new Date(endDate);
    }

    if (type === "ledger") {
      const entries = await LedgerEntry.findAll({ where, order: [["date", "ASC"]] });
      const headers = ["Date", "Reference", "Description", "Account", "Type", "Debit", "Credit", "Balance", "Category"];
      const rows = entries.map((e) => [
        e.date, e.reference, e.description, e.accountName, e.type, e.debit, e.credit, e.balance, e.category,
      ]);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="ledger-${Date.now()}.csv"`);
      return res.send(toCSV(headers, rows));
    }

    const expenses = await Expense.findAll({
      where,
      include: [{ model: User, as: "submittedBy", attributes: ["name", "email"] }],
      order: [["date", "ASC"]],
    });
    const headers = ["Date", "Title", "Category", "Amount", "Status", "Vendor", "PaymentMethod", "SubmittedBy", "Description"];
    const rows = expenses.map((e) => [
      e.date, e.title, e.category, e.amount, e.status, e.vendor, e.paymentMethod,
      e.submittedBy?.name || e.submittedBy?.email || "", e.description,
    ]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="expenses-${Date.now()}.csv"`);
    res.send(toCSV(headers, rows));
  } catch (err) {
    next(err);
  }
});

// ── Import ──────────────────────────────────────────────
router.post("/import", protect, memoryUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No CSV file uploaded" });
    const { type = "expenses" } = req.query;
    const rows = parseCSV(req.file.buffer.toString("utf-8"));

    let created = 0, skipped = 0, failed = 0;

    if (type === "ledger") {
      for (const row of rows) {
        if (!row.Date || !row.Description) { skipped++; continue; }
        try {
          await LedgerEntry.create({
            companyId: req.companyId,
            date: row.Date,
            reference: row.Reference || null,
            description: row.Description,
            accountName: row.Account || null,
            type: (row.Type || "debit").toLowerCase(),
            debit: Number(row.Debit) || 0,
            credit: Number(row.Credit) || 0,
            balance: Number(row.Balance) || 0,
            category: row.Category || null,
            createdById: req.user.id,
          });
          created++;
        } catch { failed++; }
      }
    } else {
      for (const row of rows) {
        if (!row.Date || !row.Title || !row.Amount) { skipped++; continue; }
        try {
          await Expense.create({
            companyId: req.companyId,
            title: row.Title,
            amount: Number(row.Amount),
            category: row.Category || "Other",
            date: row.Date,
            vendor: row.Vendor || null,
            paymentMethod: row.PaymentMethod || "Cash",
            description: row.Description || null,
            status: row.Status || "pending",
            submittedById: req.user.id,
          });
          created++;
        } catch { failed++; }
      }
    }

    res.json({ message: "Import complete", created, skipped, failed });
  } catch (err) {
    next(err);
  }
});

// ── Chart of accounts (derived from ledger entries) ──────
router.get("/chart-of-accounts", protect, async (req, res, next) => {
  try {
    const company = req.companyId;
    const accounts = await LedgerEntry.findAll({
      where: { companyId: company },
      attributes: [[fn("DISTINCT", col("accountName")), "name"], "accountCode"],
      raw: true,
    });
    res.json(accounts.filter((a) => a.name));
  } catch (err) {
    next(err);
  }
});

// ── Expenses: single ─────────────────────────────────────
router.get("/expenses/:id", protect, async (req, res, next) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.id, companyId: req.companyId },
      include: [{ model: User, as: "submittedBy", attributes: ["id", "name", "email"] }],
    });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    res.json(expense);
  } catch (err) {
    next(err);
  }
});

// ── Expenses: create ──────────────────────────────────────
router.post("/expenses", protect, async (req, res, next) => {
  try {
    const expense = await Expense.create({
      ...req.body,
      companyId: getCompany(req),
      submittedById: req.user.id,
    });
    res.status(201).json(expense);
  } catch (err) {
    next(err);
  }
});

// ── Expenses: update ──────────────────────────────────────
router.patch("/expenses/:id", protect, async (req, res, next) => {
  try {
    const expense = await findInScope(req, Expense, req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    await expense.update(req.body);
    res.json(expense);
  } catch (err) {
    next(err);
  }
});

// ── Expenses: delete ──────────────────────────────────────
router.delete("/expenses/:id", protect, async (req, res, next) => {
  try {
    await Expense.destroy({ where: { id: req.params.id } });
    res.json({ message: "Expense deleted" });
  } catch (err) {
    next(err);
  }
});

// ── Expenses: approve / reject ────────────────────────────
router.patch("/expenses/:id/approve", protect, async (req, res, next) => {
  try {
    const expense = await findInScope(req, Expense, req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    await expense.update({ status: "approved", approvedById: req.user.id, approvedAt: new Date() });
    res.json(expense);
  } catch (err) {
    next(err);
  }
});

router.patch("/expenses/:id/reject", protect, async (req, res, next) => {
  try {
    const expense = await findInScope(req, Expense, req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    await expense.update({ status: "rejected", rejectionReason: req.body.reason });

    await Notification.create({
      companyId: expense.companyId,
      userId: req.user.id,
      title: "Expense Rejected",
      message: `${req.user.name} rejected expense ${expense.expenseNo || expense.id}`,
      type: "expense",
      link: `/finance/expenses/${expense.id}`,
      isRead: false,
    });

    res.json(expense);
  } catch (err) {
    next(err);
  }
});

// ── Receipts: view / download ─────────────────────────────
router.get("/expenses/:id/receipt/view", protect, async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, companyId: getCompany(req) } });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    if (!expense.receipt) return res.status(404).json({ message: "Receipt not found" });
    return res.sendFile(path.resolve(process.cwd(), expense.receipt));
  } catch (err) {
    next(err);
  }
});

router.get("/expenses/:id/receipt/download", protect, async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, companyId: getCompany(req) } });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    if (!expense.receipt) return res.status(404).json({ message: "Receipt not found" });
    return res.download(path.resolve(process.cwd(), expense.receipt), expense.receiptOriginalName || "receipt");
  } catch (err) {
    next(err);
  }
});

router.get("/expenses/:id/download", protect, async (req, res, next) => {
  try {
    const expense = await findInScope(req, Expense, req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    if (req.user.role !== "super_admin" && expense.companyId !== req.companyId) {
      return res.status(403).json({ message: "You are not authorized to download this receipt." });
    }
    if (!expense.receipt) return res.status(404).json({ message: "Receipt not uploaded." });

    const filePath = path.join(process.cwd(), expense.receipt.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Receipt file not found." });

    return res.download(filePath, expense.receiptOriginalName || "receipt");
  } catch (err) {
    next(err);
  }
});

// ── Receipts: upload ───────────────────────────────────────
router.post("/expenses/:id/receipt", protect, uploadReceipt.single("receipt"), async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ where: { id: req.params.id, companyId: req.companyId } });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    if (!req.file) return res.status(400).json({ message: "No receipt uploaded" });

    await expense.update({
      receipt: `/uploads/receipts/${req.file.filename}`,
      receiptOriginalName: req.file.originalname,
      receiptMimeType: req.file.mimetype,
      receiptSize: req.file.size,
      receiptUploadedAt: new Date(),
      receiptUploadedById: req.user.id,
    });

    res.json({ message: "Receipt uploaded successfully", expense });
  } catch (err) {
    next(err);
  }
});

router.delete("/expenses/:id/receipt", protect, async (req, res, next) => {
  try {
    const expense = await findInScope(req, Expense, req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    if (expense.receipt) {
      const filePath = path.join(process.cwd(), expense.receipt.replace(/^\//, ""));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await expense.update({ receipt: null, receiptOriginalName: null, receiptMimeType: null, receiptSize: null });
    res.json({ message: "Receipt deleted successfully" });
  } catch (err) {
    next(err);
  }
});

router.get("/expenses/:id/report", protect, async (req, res, next) => {
  try {
    const expense = await Expense.findOne({
      where: { id: req.params.id, companyId: req.companyId },
      include: [
        { model: User, as: "submittedBy", attributes: ["id", "name", "email"] },
        { model: User, as: "approvedBy", attributes: ["id", "name", "email"], required: false },
        { model: Company, as: "company", attributes: ["id", "name"] },
      ],
    });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    generateExpensePDF(expense, res);
  } catch (err) {
    next(err);
  }
});

// ── Ledger: list ────────────────────────────────────────
router.get("/ledger", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const { page = 1, limit = 25, search = "", type, startDate, endDate } = req.query;

    const where = { companyId: company };
    if (search) {
      where[Op.or] = [
        { description: { [Op.like]: `%${search}%` } },
        { reference: { [Op.like]: `%${search}%` } },
      ];
    }
    if (type) where.type = type;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date[Op.gte] = new Date(startDate);
      if (endDate) where.date[Op.lte] = new Date(endDate);
    }

    const { rows, count } = await LedgerEntry.findAndCountAll({
      where,
      order: [["date", "ASC"]],
      limit: Number(limit),
      offset: (page - 1) * limit,
    });

    res.json({ entries: rows, total: count });
  } catch (err) {
    next(err);
  }
});

router.post("/ledger", protect, async (req, res, next) => {
  try {
    const entry = await LedgerEntry.create({ ...req.body, companyId: getCompany(req), createdById: req.user.id });
    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

// ── Summary (by category) ─────────────────────────────────
// ── Summary (company-wide, all pages — not just current page) ──
router.get("/summary", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);

    const [totalAmount, pendingCount, approvedCount, rejectedCount, byCategory] = await Promise.all([
      Expense.sum("amount", { where: { companyId: company } }), // all statuses
      Expense.count({ where: { companyId: company, status: "pending" } }),
      Expense.count({ where: { companyId: company, status: "approved" } }),
      Expense.count({ where: { companyId: company, status: "rejected" } }),
      Expense.findAll({
        where: { companyId: company, status: "approved" },
        attributes: ["category", [fn("SUM", col("amount")), "total"]],
        group: ["category"],
        raw: true,
      }),
    ]);

    res.json({
      totalExpense: totalAmount || 0,
      pending: pendingCount || 0,
      approved: approvedCount || 0,
      rejected: rejectedCount || 0,
      byCategory: byCategory.map((c) => ({ _id: c.category, total: Number(c.total) })),
    });
  } catch (err) {
    next(err);
  }
});

// ── Overview ───────────────────────────────────────────────
router.get("/overview", protect, async (req, res, next) => {
  try {
    const company = req.companyId;
    const now = new Date();

    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [
      totalExpensesAllTime, totalLedgerEntries, expensesThisMonth, expensesLastMonth,
      revenueThisMonth, revenueLastMonth, cashCreditTotal, cashDebitTotal,
      recentExpenses, recentCredits,
    ] = await Promise.all([
      Expense.sum("amount", { where: { companyId: company, status: "approved" } }),
      LedgerEntry.count({ where: { companyId: company } }),
      Expense.sum("amount", { where: { companyId: company, status: "approved", date: { [Op.gte]: startOfThisMonth } } }),
      Expense.sum("amount", { where: { companyId: company, status: "approved", date: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth } } }),
      LedgerEntry.sum("credit", { where: { companyId: company, date: { [Op.gte]: startOfThisMonth } } }),
      LedgerEntry.sum("credit", { where: { companyId: company, date: { [Op.gte]: startOfLastMonth, [Op.lte]: endOfLastMonth } } }),
      LedgerEntry.sum("credit", { where: { companyId: company } }),
      LedgerEntry.sum("debit", { where: { companyId: company } }),
      Expense.findAll({ where: { companyId: company, status: "approved" }, order: [["date", "DESC"]], limit: 5 }),
      LedgerEntry.findAll({ where: { companyId: company, type: "credit" }, order: [["date", "DESC"]], limit: 5 }),
    ]);

    const revenue = revenueThisMonth || 0;
    const expenses = expensesThisMonth || 0;
    const profit = revenue - expenses;
    const revenueLast = revenueLastMonth || 0;
    const expensesLast = expensesLastMonth || 0;
    const profitLast = revenueLast - expensesLast;

    const pctChange = (curr, prev) => {
      if (!prev) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / prev) * 100).toFixed(1));
    };

    const cashBalance = (cashCreditTotal || 0) - (cashDebitTotal || 0);

    const recentTransactions = [
      ...recentExpenses.map((e) => ({ description: e.title, category: e.category, date: e.date, amount: e.amount, type: "expense" })),
      ...recentCredits.map((c) => ({ description: c.description, category: c.category || "Revenue", date: c.date, amount: c.credit, type: "income" })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

    res.json({
      revenue, expenses, profit, cashBalance,
      revenueChange: pctChange(revenue, revenueLast),
      expensesChange: pctChange(expenses, expensesLast),
      profitChange: pctChange(profit, profitLast),
      cashBalanceChange: 0,
      totalExpenses: totalExpensesAllTime || 0,
      totalLedgerEntries: totalLedgerEntries || 0,
      recentTransactions,
    });
  } catch (err) {
    next(err);
  }
});

// ── Ledger: update ─────────────────────────────────────
router.patch("/ledger/:id", protect, async (req, res, next) => {
  try {
    const entry = await LedgerEntry.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!entry) return res.status(404).json({ message: "Ledger entry not found" });

    await entry.update(req.body);
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// ── Ledger: delete ─────────────────────────────────────
router.delete("/ledger/:id", protect, async (req, res, next) => {
  try {
    const entry = await LedgerEntry.findOne({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!entry) return res.status(404).json({ message: "Ledger entry not found" });

    await entry.destroy();
    res.json({ message: "Ledger entry deleted" });
  } catch (err) {
    next(err);
  }
});

// ── Revenue by month ─────────────────────────────────────
router.get("/reports/revenue-by-month", protect, async (req, res, next) => {
  try {
    const company = req.companyId;
    const months = Number(req.query.months) || 6;

    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const [revenueRows, expenseRows] = await Promise.all([
      LedgerEntry.findAll({
        where: { companyId: company, type: "credit", date: { [Op.gte]: since } },
        attributes: [[fn("DATE_FORMAT", col("date"), "%Y-%m"), "month"], [fn("SUM", col("credit")), "total"]],
        group: ["month"],
        raw: true,
      }),
      Expense.findAll({
        where: { companyId: company, status: "approved", date: { [Op.gte]: since } },
        attributes: [[fn("DATE_FORMAT", col("date"), "%Y-%m"), "month"], [fn("SUM", col("amount")), "total"]],
        group: ["month"],
        raw: true,
      }),
    ]);

    const revenueMap = Object.fromEntries(revenueRows.map((r) => [r.month, Number(r.total)]));
    const expenseMap = Object.fromEntries(expenseRows.map((r) => [r.month, Number(r.total)]));

    const data = [];
    const cursor = new Date(since);
    for (let i = 0; i < months; i++) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const label = cursor.toLocaleString("default", { month: "short", year: "2-digit" });
      data.push({ month: label, revenue: revenueMap[key] || 0, expenses: expenseMap[key] || 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;