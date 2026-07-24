// Central attendance business rules, used by check-in, check-out, and
// manual-edit routes so status/overtime are always computed the same
// way regardless of which endpoint touched the record.

// Default workday: starts 10:00 AM, no shift assigned to the employee/record.
export const DEFAULT_START_MINUTES = 10 * 60; // 10:00 AM

// Standard workday length: 8 hours.
export const STANDARD_WORK_MINUTES = 8 * 60;

// Grace period before a late check-in counts as "late" — 30 minutes past
// the shift/default start time.
export const LATE_GRACE_MINUTES = 30;

// Below this many worked minutes, the day counts as a half day (half of
// the standard 8-hour workday = 4 hours).
export const HALF_DAY_THRESHOLD_MINUTES = STANDARD_WORK_MINUTES / 2; // 4 hours

// Fallback weekly-off days (0=Sunday ... 6=Saturday) used only when an
// employee has no shift assigned. Kept in sync with Shift.weeklyOffDays'
// default. Change here (and in the Shift model default) if your company's
// standard weekend differs.
export const DEFAULT_WEEKLY_OFF_DAYS = [6];

/**
 * Whether `date` falls on a weekly-off day for the given shift (or the
 * default weekly-off days if no shift/weeklyOffDays is configured).
 * `date` may be a Date, or a DATEONLY string ("YYYY-MM-DD").
 */
export function isWeeklyOff(date, shift) {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : new Date(date);
  if (Number.isNaN(d.getTime())) return false;

  const dayOfWeek = typeof date === "string" ? d.getUTCDay() : d.getDay();
  const offDays = Array.isArray(shift?.weeklyOffDays) && shift.weeklyOffDays.length
    ? shift.weeklyOffDays
    : DEFAULT_WEEKLY_OFF_DAYS;

  return offDays.includes(dayOfWeek);
}

function parseTimeToMinutes(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function dateToMinutesOfDay(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Minutes late relative to the shift's startTime, or the default 10:00 AM
 * if no shift is assigned. Never returns null — always resolvable now.
 */
export function getLateMinutes(checkIn, shift) {
  const checkInMinutes = dateToMinutesOfDay(checkIn);
  if (checkInMinutes == null) return 0;

  const shiftStart = parseTimeToMinutes(shift?.startTime);
  const expectedStart = shiftStart != null ? shiftStart : DEFAULT_START_MINUTES;

  return Math.max(0, checkInMinutes - expectedStart);
}

export function isLateCheckIn(checkIn, shift) {
  return getLateMinutes(checkIn, shift) > LATE_GRACE_MINUTES;
}

/**
 * Computes the final attendance status from checkIn/checkOut/hoursWorked,
 * applying (in priority order):
 *   1. Half day — worked less than 4 hours (regardless of arrival time)
 *   2. Late — arrived more than 30 minutes past the expected start
 *   3. Present — everything else
 *
 * `currentStatus` lets callers preserve manually-set values like
 * "absent" or "holiday" that shouldn't be overwritten by time-based logic.
 */
export function computeAttendanceStatus({ checkIn, checkOut, hoursWorked, shift, currentStatus }) {
  if (currentStatus === "absent" || currentStatus === "holiday") {
    return currentStatus;
  }

  if (checkOut && hoursWorked != null) {
    const workedMinutes = Math.round(Number(hoursWorked) * 60);
    if (workedMinutes < HALF_DAY_THRESHOLD_MINUTES) {
      return "half_day";
    }
  }

  if (checkIn && isLateCheckIn(checkIn, shift)) {
    return "late";
  }

  return "present";
}

/**
 * Hours worked beyond the standard 8-hour workday (or the assigned
 * shift's actual duration, if longer/shorter than 8h).
 */
export function computeOvertimeHours(hoursWorked, shift) {
  if (hoursWorked == null) return 0;

  let expectedMinutes = STANDARD_WORK_MINUTES;
  const shiftStart = parseTimeToMinutes(shift?.startTime);
  const shiftEnd = parseTimeToMinutes(shift?.endTime);
  if (shiftStart != null && shiftEnd != null) {
    let duration = shiftEnd - shiftStart;
    if (duration <= 0) duration += 24 * 60; // overnight shift
    expectedMinutes = duration;
  }

  const workedMinutes = Math.round(Number(hoursWorked) * 60);
  const overtimeMinutes = Math.max(0, workedMinutes - expectedMinutes);
  return Math.round((overtimeMinutes / 60) * 100) / 100;
}