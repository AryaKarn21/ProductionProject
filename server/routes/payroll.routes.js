import express from "express";
import { Op } from "sequelize";
import { PayrollRun, Payslip, Employee, Attendance } from "../models/index.js";
import { protect } from "../middleware/auth.js";
import { generatePayslipPDF } from "../reports/payslipReport.js";

const router = express.Router();

// `period` is a free-text string like "July 2026" (see POST /runs below).
// If it parses to a real month, we can look up that month's Attendance rows
// and deduct unpaid absent days. If it doesn't parse (e.g. a custom label),
// we skip the deduction entirely and behave exactly as before — this is a
// pure addition, not a change to any existing payroll math.
function resolvePeriodDateRange(period) {
  const parsed = new Date(period);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = parsed.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // last day of month
  const daysInMonth = end.getDate();

  const toDateOnly = (d) => d.toISOString().slice(0, 10);
  return { from: toDateOnly(start), to: toDateOnly(end), daysInMonth };
}

// FIXED: was reading req.headers['x-company-id'], which the frontend
// never sends — always resolved to null, meaning every payroll run ever
// processed 0 employees. Now matches every other route file's tenant
// resolution via the resolveCompany middleware.
const getCompany = (req) => req.companyId;

// ── List runs (FIXED — real pagination + filtering + {runs, total} shape) ──
router.get("/runs", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const { page = 1, limit = 20, search = "", status } = req.query;

    const where = { companyId: company };
    if (status) where.status = status;
    if (search) where.period = { [Op.like]: `%${search}%` };

    const { rows, count } = await PayrollRun.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset: (page - 1) * limit,
    });

    res.json({ runs: rows, total: count });
  } catch (err) {
    next(err);
  }
});

router.get("/runs/:id", protect, async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({
      where: { id: req.params.id, companyId: req.companyId },
      include: [
        {
          model: Payslip,
          as: "payslips",
          include: [{ model: Employee, as: "employee", attributes: ["firstName", "lastName", "employeeId"] }],
        },
      ],
    });
    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// ── Create a DRAFT run (no payslips generated yet) ──
router.post("/runs", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const { period } = req.body;

    if (!period) {
      return res.status(400).json({ message: "period is required (e.g. 'July 2026')" });
    }

    const employeeCount = await Employee.count({ where: { companyId: company, status: "active" } });

    const run = await PayrollRun.create({
      companyId: company,
      period,
      employeeCount,
      status: "draft",
      processedById: req.user.id,
    });

    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

// ── Process a draft run — generates payslips for every active employee ──
router.post("/runs/:id/process", protect, async (req, res, next) => {
  try {
    const company = getCompany(req);
    const run = await PayrollRun.findOne({ where: { id: req.params.id, companyId: company } });

    if (!run) return res.status(404).json({ message: "Payroll run not found" });
    if (run.status !== "draft") {
      return res.status(400).json({ message: `Run is already ${run.status}; only draft runs can be processed.` });
    }

    const employees = await Employee.findAll({ where: { companyId: company, status: "active" } });

    if (!employees.length) {
      return res.status(400).json({ message: "No active employees found for this company." });
    }

    let grossTotal = 0, deductionsTotal = 0, netTotal = 0;

    // If the period maps to a real calendar month, pull that month's absent
    // days per employee so payroll reflects the automatic Absent status.
    // If it doesn't parse, absentDaysByEmployee stays empty and every
    // employee gets 0 unpaidAbsentDays/absentDeduction — identical to the
    // pre-existing behavior.
    const range = resolvePeriodDateRange(run.period);
    const absentDaysByEmployee = new Map();

    if (range) {
      const absentRows = await Attendance.findAll({
        where: {
          companyId: company,
          employeeId: { [Op.in]: employees.map((e) => e.id) },
          status: "absent",
          date: { [Op.between]: [range.from, range.to] },
        },
        attributes: ["employeeId"],
      });
      for (const row of absentRows) {
        absentDaysByEmployee.set(
          row.employeeId,
          (absentDaysByEmployee.get(row.employeeId) || 0) + 1,
        );
      }
    }

    const payslipRows = employees.map((emp) => {
      const basicSalary = Number(emp.salary) || 0;
      const allowances = basicSalary * 0.1;
      const grossPay = basicSalary + allowances;
      const tax = grossPay * 0.13; // flat rate — see note below on making this configurable

      const unpaidAbsentDays = absentDaysByEmployee.get(emp.id) || 0;
      const absentDeduction = range && unpaidAbsentDays
        ? Math.round((basicSalary / range.daysInMonth) * unpaidAbsentDays * 100) / 100
        : 0;

      const deductions = tax + absentDeduction;
      const netPay = grossPay - deductions;

      grossTotal += grossPay;
      deductionsTotal += deductions;
      netTotal += netPay;

      return {
        companyId: company,
        employeeId: emp.id,
        payrollRunId: run.id,
        period: run.period,
        basicSalary, allowances, deductions, tax, netPay, grossPay,
        unpaidAbsentDays, absentDeduction,
        processedAt: new Date(),
      };
    });

    await Payslip.bulkCreate(payslipRows);

    await run.update({
      employeeCount: employees.length,
      grossPay: grossTotal,
      deductions: deductionsTotal,
      netPay: netTotal,
      status: "processed",
      processedAt: new Date(),
    });

    res.json(run);
  } catch (err) {
    next(err);
  }
});

// ── Approve a processed run ──
router.patch("/runs/:id/approve", protect, async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ where: { id: req.params.id, companyId: req.companyId } });
    if (!run) return res.status(404).json({ message: "Payroll run not found" });

    if (run.status !== "processed") {
      return res.status(400).json({ message: `Only processed runs can be approved (current status: ${run.status}).` });
    }

    await run.update({ status: "approved", approvedById: req.user.id, approvedAt: new Date() });
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// ── Mark an approved run as paid ──
router.patch("/runs/:id/mark-paid", protect, async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ where: { id: req.params.id, companyId: req.companyId } });
    if (!run) return res.status(404).json({ message: "Payroll run not found" });

    if (run.status !== "approved") {
      return res.status(400).json({ message: `Only approved runs can be marked paid (current status: ${run.status}).` });
    }

    await run.update({ status: "paid" });
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// ── Cancel a draft run ──
router.delete("/runs/:id", protect, async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ where: { id: req.params.id, companyId: req.companyId } });
    if (!run) return res.status(404).json({ message: "Payroll run not found" });

    if (run.status !== "draft") {
      return res.status(400).json({ message: "Only draft runs can be deleted. Processed runs must be kept for records." });
    }

    await run.destroy();
    res.json({ message: "Payroll run deleted" });
  } catch (err) {
    next(err);
  }
});

// ── Payslips for one employee (FIXED — company-scoped, no cross-tenant leak) ──
router.get("/payslips/:employeeId", protect, async (req, res, next) => {
  try {
    const employee = await Employee.findOne({
      where: { id: req.params.employeeId, companyId: req.companyId },
    });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const payslips = await Payslip.findAll({
      where: { employeeId: req.params.employeeId, companyId: req.companyId },
      order: [["createdAt", "DESC"]],
    });
    res.json(payslips);
  } catch (err) {
    next(err);
  }
});

// ── All payslips across the company (for a company-wide payslips list view) ──
router.get("/payslips", protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, period, employeeId } = req.query;

    const where = { companyId: req.companyId };
    if (period) where.period = period;
    if (employeeId) where.employeeId = employeeId;

    const { rows, count } = await Payslip.findAndCountAll({
      where,
      include: [{ model: Employee, as: "employee", attributes: ["firstName", "lastName", "employeeId"] }],
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset: (page - 1) * limit,
    });

    res.json({ payslips: rows, total: count });
  } catch (err) {
    next(err);
  }
});

// ── Download a single payslip as PDF ──
router.get("/payslips/:id/download", protect, async (req, res, next) => {
  try {
    const payslip = await Payslip.findOne({
      where: { id: req.params.id, companyId: req.companyId },
      include: [{ model: Employee, as: "employee", attributes: ["firstName", "lastName", "employeeId"] }],
    });
    if (!payslip) return res.status(404).json({ message: "Payslip not found" });

    generatePayslipPDF(payslip, res);
  } catch (err) {
    next(err);
  }
});

export default router;