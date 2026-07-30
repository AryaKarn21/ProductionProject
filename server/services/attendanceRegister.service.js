// ─────────────────────────────────────────────────────────────────────────
// Standard attendance register: employees × days, spanning one or more
// calendar months — the classic paper-register layout (one row per
// employee, one column per day, a single-letter code per cell, totals on
// the right).
//
// This deliberately does NOT depend on the nightly finalization job having
// already run for every date in range. A day is resolved the same way
// finalizeAbsencesForDate() would resolve it (services/attendanceFinalization
// .service.js) — same precedence: existing record > company holiday >
// approved leave > weekly off > absent — so the register always matches
// what the cron will eventually persist, even for "yesterday" before
// 00:15 has run. Existing Attendance rows are never overwritten; this is
// read-only.
// ─────────────────────────────────────────────────────────────────────────

import { Op } from "sequelize";
import { Attendance, Employee, Shift, Leave, Holiday } from "../models/index.js";
import { isWeeklyOff } from "../utils/attendanceRules.js";

const STATUS_CODE = {
  present: "P",
  late: "LT",
  half_day: "HD",
  absent: "A",
  holiday: "H",
};

// One-letter/short codes for days that have no Attendance row at all yet.
const LEAVE_CODE = "LV";
const WEEKLY_OFF_CODE = "WO";
const NOT_JOINED_CODE = "—";
const PENDING_CODE = ""; // today or a future date — nothing to report yet

function toDateOnlyString(date) {
  const d = typeof date === "string" ? date : date.toISOString();
  return d.slice(0, 10);
}

function todayDateOnlyString() {
  return toDateOnlyString(new Date());
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Builds the list of calendar months (most recent last) and every date
 * within them, given an end month "YYYY-MM" and a span in months.
 */
function buildMonthRange(endMonth, span) {
  const [endYear, endMonthIndex1] = endMonth.split("-").map(Number);
  const endMonthIndex = endMonthIndex1 - 1;

  const months = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonthIndex - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const total = daysInMonth(year, monthIndex);
    const dates = Array.from({ length: total }, (_, idx) => {
      const day = idx + 1;
      const mm = String(monthIndex + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${year}-${mm}-${dd}`;
    });
    months.push({
      year,
      month: monthIndex + 1,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
      shortLabel: d.toLocaleString("en-US", { month: "short" }),
      days: total,
      dates,
    });
  }
  return months;
}

const LEGEND = {
  P: "Present",
  LT: "Late",
  HD: "Half day",
  A: "Absent",
  H: "Holiday",
  LV: "Leave",
  WO: "Weekly off",
  "—": "Not yet joined",
};

/**
 * Builds a standard attendance register.
 *
 * @param companyId
 * @param opts.endMonth   "YYYY-MM", defaults to the current month
 * @param opts.months      how many calendar months, ending at endMonth (default 2)
 * @param opts.department  optional department filter
 * @param opts.employeeId  optional single-employee filter
 */
export async function buildAttendanceRegister(companyId, opts = {}) {
  const now = new Date();
  const endMonth =
    opts.endMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const span = Math.min(Math.max(Number(opts.months) || 2, 1), 6);

  const months = buildMonthRange(endMonth, span);
  const rangeStart = months[0].dates[0];
  const rangeEnd = months[months.length - 1].dates[months[months.length - 1].dates.length - 1];
  const today = todayDateOnlyString();

  const employeeWhere = { companyId };
  if (opts.department) employeeWhere.department = opts.department;
  if (opts.employeeId) employeeWhere.id = opts.employeeId;

  const employees = await Employee.findAll({
    where: employeeWhere,
    attributes: ["id", "firstName", "lastName", "employeeId", "department", "joinDate", "status", "avatar", "shiftId"],
    include: [{ model: Shift, as: "shift", attributes: ["id", "name", "weeklyOffDays"] }],
    order: [["firstName", "ASC"], ["lastName", "ASC"]],
  });

  if (!employees.length) {
    return { months, employees: [], rangeStart, rangeEnd };
  }

  const employeeIds = employees.map((e) => e.id);

  const [records, holidays, leaves] = await Promise.all([
    Attendance.findAll({
      where: {
        companyId,
        employeeId: { [Op.in]: employeeIds },
        date: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd },
      },
      attributes: ["employeeId", "date", "status"],
      raw: true,
    }),
    Holiday.findAll({
      where: { companyId, isActive: true, date: { [Op.gte]: rangeStart, [Op.lte]: rangeEnd } },
      attributes: ["date", "name"],
      raw: true,
    }),
    Leave.findAll({
      where: {
        companyId,
        employeeId: { [Op.in]: employeeIds },
        status: "approved",
        startDate: { [Op.lte]: rangeEnd },
        endDate: { [Op.gte]: rangeStart },
      },
      attributes: ["employeeId", "startDate", "endDate"],
      raw: true,
    }),
  ]);

  // recordsByEmployee[employeeId][date] = status
  const recordsByEmployee = new Map();
  for (const r of records) {
    const key = r.employeeId;
    if (!recordsByEmployee.has(key)) recordsByEmployee.set(key, new Map());
    recordsByEmployee.get(key).set(toDateOnlyString(r.date), r.status);
  }

  const holidayByDate = new Map(holidays.map((h) => [toDateOnlyString(h.date), h.name]));

  // leavesByEmployee[employeeId] = [{start, end}]
  const leavesByEmployee = new Map();
  for (const l of leaves) {
    if (!leavesByEmployee.has(l.employeeId)) leavesByEmployee.set(l.employeeId, []);
    leavesByEmployee.get(l.employeeId).push({
      start: toDateOnlyString(l.startDate),
      end: toDateOnlyString(l.endDate),
    });
  }
  const isOnLeave = (employeeId, date) =>
    (leavesByEmployee.get(employeeId) || []).some((l) => date >= l.start && date <= l.end);

  const allDates = months.flatMap((m) => m.dates);

  const rows = employees.map((employee) => {
    const own = recordsByEmployee.get(employee.id) || new Map();
    const totals = {
      present: 0,
      late: 0,
      halfDay: 0,
      absent: 0,
      holiday: 0,
      leave: 0,
      weeklyOff: 0,
      workingDays: 0, // present + late + half_day + absent — the denominator for %
    };

    const days = {};

    for (const date of allDates) {
      if (date < employee.joinDate) {
        days[date] = NOT_JOINED_CODE;
        continue;
      }

      const existing = own.get(date);
      if (existing) {
        days[date] = STATUS_CODE[existing] || existing;
        if (existing === "present") totals.present += 1;
        else if (existing === "late") totals.late += 1;
        else if (existing === "half_day") totals.halfDay += 1;
        else if (existing === "absent") totals.absent += 1;
        else if (existing === "holiday") totals.holiday += 1;
        if (["present", "late", "half_day", "absent"].includes(existing)) {
          totals.workingDays += 1;
        }
        continue;
      }

      if (holidayByDate.has(date)) {
        days[date] = "H";
        totals.holiday += 1;
        continue;
      }

      if (isOnLeave(employee.id, date)) {
        days[date] = LEAVE_CODE;
        totals.leave += 1;
        continue;
      }

      if (isWeeklyOff(date, employee.shift)) {
        days[date] = WEEKLY_OFF_CODE;
        totals.weeklyOff += 1;
        continue;
      }

      if (date >= today) {
        days[date] = PENDING_CODE;
        continue;
      }

      // A scheduled working day, strictly in the past, with no record —
      // exactly what finalizeAbsencesForDate() would mark absent once the
      // nightly cron reaches it. Reported live here so the register never
      // has to wait for 00:15.
      days[date] = "A";
      totals.absent += 1;
      totals.workingDays += 1;
    }

    const attendedDays = totals.present + totals.late + totals.halfDay * 0.5;
    const attendancePct = totals.workingDays
      ? Math.round((attendedDays / totals.workingDays) * 100)
      : null;

    return {
      employee: {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`.trim(),
        employeeCode: employee.employeeId || null,
        department: employee.department || null,
        avatar: employee.avatar || null,
      },
      days,
      totals: { ...totals, attendancePct },
    };
  });

  return { months, employees: rows, rangeStart, rangeEnd, legend: LEGEND };
}