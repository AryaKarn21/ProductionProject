import express from "express";
import { Op, fn, col } from "sequelize";
import { Attendance, Employee, Shift } from "../models/index.js";
import { protect } from "../middleware/auth.js";

import { createNotification } from "../services/notification.service.js";
import {
  finalizeAbsencesForDate,
  finalizeAbsencesForRange,
} from "../services/attendanceFinalization.service.js";
import { findInScope } from '../utils/scope.js'
const router = express.Router();

const getCompany = (req) => req.companyId || req.headers['x-company-id'] || req.headers['x-company-id'] || req.get('X-Company-ID');

router.get("/", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Company not found",
      });
    }

    const {
      page = 1,
      limit = 25,
      date,
      dateFrom,
      dateTo,
      status,
      approvalStatus,
      department,
      shiftId,
      search,
    } = req.query;
    const where = {
      companyId,
    };
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;
    if (shiftId) where.shiftId = shiftId;

    // Supports both the legacy single `date` param and a `dateFrom`/`dateTo`
    // range. If only one bound is given, the range collapses to that single day.
    const rangeStart = dateFrom || date;
    const rangeEnd = dateTo || dateFrom || date;
    if (rangeStart) {
      const start = new Date(rangeStart);
      start.setHours(0, 0, 0, 0);
      const end = new Date(rangeEnd || rangeStart);
      end.setHours(23, 59, 59, 999);
      where.date = { [Op.gte]: start, [Op.lte]: end };
    }
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Mongoose used populate(...match) to filter on a joined field and then
    // dropped rows whose employee didn't match. Sequelize: filter the
    // include directly with `where`, and use `required: true` (inner join)
    // so non-matching rows are excluded by the DB, not after the fact.
    const employeeConditions = [];
    if (search) {
      employeeConditions.push({
        [Op.or]: [
          { firstName: { [Op.like]: `%${search}%` } },
          { lastName: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (department) employeeConditions.push({ department });
    const employeeWhere = employeeConditions.length
      ? { [Op.and]: employeeConditions }
      : undefined;

    const { rows: attendance, count: total } = await Attendance.findAndCountAll(
      {
        where,
        order: [["date", "DESC"]],
        offset,
        limit: parseInt(limit),
        include: [
          {
            model: Employee,
            as: "employee",
            attributes: ["firstName", "lastName", "department", "avatar"],
            where: employeeWhere,
            required: !!(search || department),
          },
          {
            model: Shift,
            as: "shift",
            attributes: ["id", "name", "startTime", "endTime"],
          },
        ],
      },
    );

    res.json({ attendance, total });
  } catch (err) {
    next(err);
  }
});

router.post("/checkin", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Company not found",
      });
    }

    const employee = await Employee.findByPk(req.body.employeeId);

    if (!employee) {
      return res.status(404).json({
        message: "Employee not found",
      });
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const existing = await Attendance.findOne({
      where: {
        employeeId: req.body.employeeId,
        companyId,
        date: {
          [Op.between]: [start, end],
        },
      },
    });

    if (existing) {
      return res.status(400).json({
        message: "Employee has already checked in today.",
      });
    }
    const now = new Date();
    const record = await Attendance.create({
      ...req.body,
      companyId,
      shiftId: req.body.shiftId,
      date: now,
      checkIn: now,
    });

    await createNotification({
      companyId: record.companyId,
      userId: req.user.id,
      senderId: req.user.id,
      module: "hr",
      type: "attendance_checkin",
      title: "Attendance Checked In",
      message: `${employee.firstName} ${employee.lastName} checked in successfully.`,
      priority: "low",
      actionUrl: "/hr/attendance",
      metadata: {
        attendanceId: record.id,
        employeeId: employee.id,
      },
    });

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// CHECK OUT — closes today's open attendance record for an employee,
// computes hours worked / overtime, and derives a status.
// ─────────────────────────────────────────────────────────────
router.post("/checkout", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Company not found",
      });
    }

    const employee = await Employee.findByPk(req.body.employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const record = await Attendance.findOne({
      where: {
        employeeId: req.body.employeeId,
        companyId,
        date: { [Op.between]: [start, end] },
      },
    });

    if (!record) {
      return res.status(404).json({ message: "No check-in found for today" });
    }
    if (record.checkOut) {
      return res.status(400).json({ message: "Employee has already checked out today." });
    }

    const shift = record.shiftId ? await Shift.findByPk(record.shiftId) : null;

    const checkOut = new Date();
    const hours = (checkOut - new Date(record.checkIn)) / (1000 * 60 * 60);
    const hoursWorked = Math.round(hours * 100) / 100;

    // Standard 8-hour workday unless the assigned shift says otherwise.
    const expectedHours = shift?.durationHours || 8;
    const overtimeHours = hoursWorked > expectedHours
      ? Math.round((hoursWorked - expectedHours) * 100) / 100
      : 0;

    let status = record.status;
    if (hoursWorked < expectedHours / 2) {
      status = "half_day";
    } else if (status !== "late") {
      status = "present";
    }

    record.checkOut = checkOut;
    record.hoursWorked = hoursWorked;
    record.overtimeHours = overtimeHours;
    record.status = status;
    await record.save();

    await createNotification({
      companyId: record.companyId,
      userId: req.user.id,
      senderId: req.user.id,
      module: "hr",
      type: "attendance_checkout",
      title: "Attendance Checked Out",
      message: `${employee.firstName} ${employee.lastName} checked out successfully.`,
      priority: "low",
      actionUrl: "/hr/attendance",
      metadata: {
        attendanceId: record.id,
        employeeId: employee.id,
      },
    });

    res.json(record);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Company not found",
      });
    }

    const record = await findInScope(req, Attendance, req.params.id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found",
      });
    }

    const { status, approvalStatus, checkIn, checkOut, notes, breakMinutes } = req.body;
    let hoursWorked = record.hoursWorked;

    if (checkIn && checkOut) {
      hoursWorked =
        Math.round(
          ((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60)) * 100,
        ) / 100;
    }

    await record.update({
      status,
      approvalStatus,
      checkIn,
      checkOut,
      shiftId: req.body.shiftId,
      notes,
      breakMinutes,
      hoursWorked,
    });

    const employee = await Employee.findByPk(record.employeeId);

    await createNotification({
      companyId: record.companyId,
      userId: req.user.id,
      senderId: req.user.id,
      module: "hr",
      type: "attendance_updated",
      title: "Attendance Updated",
      message: `${employee.firstName} ${employee.lastName}'s attendance has been updated.`,
      priority: "medium",
      actionUrl: "/hr/attendance",
      metadata: {
        attendanceId: record.id,
        employeeId: employee.id,
      },
    });

    res.json(record);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────
// FINALIZE ABSENCES — marks employees "absent" for past working days with
// no attendance/check-in record, no approved leave, no weekly-off, and no
// company holiday. The daily cron job (scheduler.service.js) calls the same
// underlying service automatically every night; this endpoint exists so an
// admin can (a) backfill historical missing days, or (b) manually trigger
// finalization for a specific date without waiting for the cron job.
//
// Body: { date: "YYYY-MM-DD" }  OR  { fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }
// ─────────────────────────────────────────────────────────────
router.post("/finalize-absences", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);
    if (!companyId) {
      return res.status(400).json({ message: "Company not found" });
    }

    const { date, fromDate, toDate } = req.body;

    if (!date && !fromDate) {
      return res.status(400).json({
        message: "Provide either { date } or { fromDate, toDate }.",
      });
    }

    const results = date
      ? [await finalizeAbsencesForDate(companyId, date)]
      : await finalizeAbsencesForRange(companyId, fromDate, toDate || fromDate);

    const totalMarked = results.reduce((sum, r) => sum + (r.marked || 0), 0);

    res.json({ totalMarked, results });
  } catch (err) {
    next(err);
  }
});

router.get("/shifts", protect, (req, res) =>
  res.json([
    { _id: "1", name: "Morning", start: "09:00", end: "17:00" },
    { _id: "2", name: "Evening", start: "14:00", end: "22:00" },
  ]),
);

router.get("/summary", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);
    if (!companyId) {
      return res.status(400).json({
        message: "Company not found",
      });
    }
    // Mongoose $group by status -> Sequelize group by + count
    const summary = await Attendance.findAll({
      where: { companyId },
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    });
    // shape to match the old { _id, count } output
    res.json(summary.map((s) => ({ _id: s.status, count: Number(s.count) })));
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", protect, async (req, res, next) => {
  try {
    const companyId = getCompany(req);

    if (!companyId) {
      return res.status(400).json({
        message: "Company not found",
      });
    }

    const record = await findInScope(req, Attendance, req.params.id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found",
      });
    }

    const employee = await Employee.findByPk(record.employeeId);

    await createNotification({
      companyId: record.companyId,
      userId: req.user.id,
      senderId: req.user.id,
      module: "hr",
      type: "attendance_deleted",
      title: "Attendance Deleted",
      message: `${employee.firstName} ${employee.lastName}'s attendance has been deleted.`,
      priority: "low",
      actionUrl: "/hr/attendance",
      metadata: {
        attendanceId: record.id,
        employeeId: employee.id,
      },
    });

    await record.destroy();

    res.json({
      message: "Attendance deleted",
    });
  } catch (err) {
    next(err);
  }
});

export default router;