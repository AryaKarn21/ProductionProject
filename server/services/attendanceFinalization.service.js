// ─────────────────────────────────────────────────────────────────────────
// Automatic Absent finalization.
//
// This was previously MISSING entirely: no code path in this codebase ever
// created an "absent" Attendance row. Attendance rows only ever came from
// the employee-initiated POST /api/attendance/checkin. If an employee never
// checked in, no row existed for that day, so the day silently disappeared
// from the calendar, monthly summary, dashboard, and payroll instead of
// counting as Absent.
//
// This service is the single place that decides "should this employee be
// marked absent for this date", used by:
//   - the daily cron job (services/scheduler.service.js)
//   - the manual/backfill endpoint (POST /api/attendance/finalize-absences)
// so there is exactly one implementation of the rule, not two.
// ─────────────────────────────────────────────────────────────────────────

import { Op } from "sequelize";
import { Attendance, Employee, Shift, Leave, Holiday } from "../models/index.js";
import { isWeeklyOff } from "../utils/attendanceRules.js";

function toDateOnlyString(date) {
  const d = typeof date === "string" ? date : date.toISOString();
  return d.slice(0, 10); // "YYYY-MM-DD"
}

function todayDateOnlyString() {
  return toDateOnlyString(new Date());
}

/**
 * Finalizes Absent (or Holiday) records for ONE company on ONE past date.
 * Never touches today or a future date — that guard is enforced here so
 * every caller (cron, backfill, manual trigger) gets the same protection.
 *
 * Returns a summary: { date, skippedReason?, marked, alreadyHasRecord, onApprovedLeave, weeklyOff, holiday, notYetJoined, inactive }
 */
export async function finalizeAbsencesForDate(companyId, dateInput) {
  const date = toDateOnlyString(dateInput);
  const today = todayDateOnlyString();

  const summary = {
    date,
    marked: 0,
    alreadyHasRecord: 0,
    onApprovedLeave: 0,
    weeklyOff: 0,
    holiday: 0,
    notYetJoined: 0,
    inactive: 0,
  };

  // Rule: only a strictly past date, never today/future.
  if (date >= today) {
    return { ...summary, skippedReason: "not_a_past_date" };
  }

  // Rule: link company holidays into attendance — if the whole company is
  // on holiday, employees are never marked "absent" for that date. Instead
  // an explicit "holiday" Attendance row is created per eligible employee so
  // the day is visibly linked/accounted for in the attendance log, stat
  // cards, monthly summaries, and payroll — rather than the date silently
  // having no record at all.
  const holiday = await Holiday.findOne({
    where: { companyId, date, isActive: true },
  });

  // Rule: employee must have been active AND already joined on/before this date.
  // NOTE: Employee.status is the *current* status, not a point-in-time history —
  // this is a pre-existing limitation of the schema (no employment status log
  // exists), so "active" here means "currently active", best-effort.
  const employees = await Employee.findAll({
    where: {
      companyId,
      status: "active",
      joinDate: { [Op.lte]: date },
    },
    include: [{ model: Shift, as: "shift", attributes: ["id", "weeklyOffDays"] }],
  });

  if (!employees.length) {
    return holiday ? { ...summary, skippedReason: "company_holiday" } : summary;
  }

  const employeeIds = employees.map((e) => e.id);

  // Rule: no valid attendance/check-in already exists for this date.
  // Any existing row (present/late/half_day/absent/holiday, approved or not)
  // is left completely untouched — this job only ever fills gaps, it never
  // overwrites a record that already exists.
  const existingRecords = await Attendance.findAll({
    where: { companyId, date, employeeId: { [Op.in]: employeeIds } },
    attributes: ["employeeId"],
  });
  const employeeIdsWithRecord = new Set(existingRecords.map((r) => r.employeeId));

  // Rule: not on approved leave covering this date.
  const approvedLeaves = await Leave.findAll({
    where: {
      companyId,
      employeeId: { [Op.in]: employeeIds },
      status: "approved",
      startDate: { [Op.lte]: date },
      endDate: { [Op.gte]: date },
    },
    attributes: ["employeeId"],
  });
  const employeeIdsOnLeave = new Set(approvedLeaves.map((l) => l.employeeId));

  const rowsToCreate = [];

  for (const employee of employees) {
    if (employeeIdsWithRecord.has(employee.id)) {
      summary.alreadyHasRecord += 1;
      continue;
    }

    if (employeeIdsOnLeave.has(employee.id)) {
      summary.onApprovedLeave += 1;
      continue;
    }

    if (holiday) {
      // Holiday takes precedence over weekly-off — either way nobody gets
      // marked absent, but we still want a "holiday" row so the day shows
      // up (linked to the holiday) instead of just being blank.
      rowsToCreate.push({
        companyId,
        employeeId: employee.id,
        shiftId: employee.shiftId || null,
        date,
        status: "holiday",
        approvalStatus: "approved",
        hoursWorked: 0,
        overtimeHours: 0,
        notes: `Company holiday: ${holiday.name}`,
      });
      summary.holiday += 1;
      continue;
    }

    // Rule: it was a scheduled working day / not a weekly off.
    if (isWeeklyOff(date, employee.shift)) {
      summary.weeklyOff += 1;
      continue;
    }

    rowsToCreate.push({
      companyId,
      employeeId: employee.id,
      shiftId: employee.shiftId || null,
      date,
      status: "absent",
      approvalStatus: "approved",
      hoursWorked: 0,
      overtimeHours: 0,
      notes: "Auto-marked absent: no attendance record found for a scheduled working day.",
    });
  }

  if (rowsToCreate.length) {
    await Attendance.bulkCreate(rowsToCreate);
    summary.marked = rowsToCreate.filter((r) => r.status === "absent").length;
  }

  return holiday ? { ...summary, skippedReason: "company_holiday" } : summary;
}

/**
 * Finalizes Absent records for ONE company across an inclusive date range.
 * Used for historical backfill of missing days.
 */
export async function finalizeAbsencesForRange(companyId, fromDateInput, toDateInput) {
  const from = toDateOnlyString(fromDateInput);
  const to = toDateOnlyString(toDateInput);

  const results = [];
  let cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end) {
    const dateStr = toDateOnlyString(cursor);
    results.push(await finalizeAbsencesForDate(companyId, dateStr));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return results;
}

/**
 * Runs the daily finalization for EVERY company, for "yesterday" (server
 * date). This is what the cron job calls once a day. Kept separate from
 * finalizeAbsencesForDate so the cron entrypoint has no per-company logic
 * duplicated elsewhere.
 */
export async function runDailyAttendanceFinalization() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = toDateOnlyString(yesterday);

  // companyId is required on Employee, so distinct employee company IDs are
  // exactly the set of companies that need finalization.
  const companyRows = await Employee.findAll({
    attributes: ["companyId"],
    group: ["companyId"],
    raw: true,
  });

  const results = [];
  for (const row of companyRows) {
    if (!row.companyId) continue;
    try {
      const summary = await finalizeAbsencesForDate(row.companyId, dateStr);
      results.push({ companyId: row.companyId, ...summary });
    } catch (err) {
      console.error(`Attendance finalization failed for company ${row.companyId}:`, err);
    }
  }

  return results;
}