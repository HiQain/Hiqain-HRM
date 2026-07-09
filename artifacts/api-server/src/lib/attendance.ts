import { type employeesTable } from "@workspace/db";
import { parseHHMM } from "./dates";

type EmployeeRow = typeof employeesTable.$inferSelect;
type AttendanceLike = {
  date: string;
  status: string;
  isLate: boolean;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  workedMinutes: number | null;
  notes?: string | null;
  workMode?: "onsite" | "remote_work" | null;
};
const ATTENDANCE_TIMEZONE_OFFSET_MINUTES = 5 * 60;
const MANUAL_OVERRIDE_NOTE_PREFIX = "[manual_attendance_override]";
const ATTENDANCE_REMOTE_WORK_MODE_TAG = "[attendance_work_mode:remote_work]";
const MISSING_CHECKOUT_ABSENT_NOTE =
  "Absent auto-marked because check-out was not recorded before shift end.";

function minutesFromHHMM(value: string): number {
  const { h, m } = parseHHMM(value);
  return h * 60 + m;
}

function shiftDateParts(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

function asAttendanceTimezone(date: Date): Date {
  return new Date(
    date.getTime() + ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60_000,
  );
}

function ymdInAttendanceTimezone(date: Date): string {
  const zoned = asAttendanceTimezone(date);
  const year = zoned.getUTCFullYear();
  const month = String(zoned.getUTCMonth() + 1).padStart(2, "0");
  const day = String(zoned.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function attendanceTodayYmd(now: Date = new Date()): string {
  return ymdInAttendanceTimezone(now);
}

function shiftDateFromOffset(dateStr: string, daysDelta: number): string {
  const { year, month, day } = shiftDateParts(dateStr);
  const shifted = new Date(Date.UTC(year, month - 1, day + daysDelta));
  const nextYear = shifted.getUTCFullYear();
  const nextMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function shiftDateByDays(dateStr: string, daysDelta: number): string {
  return shiftDateFromOffset(dateStr, daysDelta);
}

function shiftStartDate(dateStr: string, officeStartTime: string): Date {
  const { h, m } = parseHHMM(officeStartTime);
  const { year, month, day } = shiftDateParts(dateStr);
  return new Date(
    Date.UTC(year, month - 1, day, h, m) -
      ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60_000,
  );
}

export function isOvernightShift(emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">): boolean {
  return minutesFromHHMM(emp.officeEndTime) <= minutesFromHHMM(emp.officeStartTime);
}

export function shiftSpanMinutes(
  emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">,
): number {
  const startMinutes = minutesFromHHMM(emp.officeStartTime);
  const endMinutes = minutesFromHHMM(emp.officeEndTime);
  if (endMinutes <= startMinutes) {
    return 24 * 60 - startMinutes + endMinutes;
  }
  return endMinutes - startMinutes;
}

export function officeMinutes(
  emp: Pick<
    EmployeeRow,
    "officeStartTime" | "officeEndTime" | "breakMinutes"
  >,
): number {
  return Math.max(0, shiftSpanMinutes(emp) - Math.max(0, emp.breakMinutes ?? 0));
}

export function resolveAttendanceShiftDate(
  emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">,
  now: Date,
): string {
  const today = ymdInAttendanceTimezone(now);
  if (!isOvernightShift(emp)) return today;

  const zonedNow = asAttendanceTimezone(now);
  const nowMinutes = zonedNow.getUTCHours() * 60 + zonedNow.getUTCMinutes();
  const endMinutes = minutesFromHHMM(emp.officeEndTime);
  if (nowMinutes <= endMinutes) {
    return shiftDateFromOffset(today, -1);
  }
  return today;
}

export function attendanceCandidateShiftDates(
  emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">,
  now: Date,
): string[] {
  const today = ymdInAttendanceTimezone(now);
  if (!isOvernightShift(emp)) {
    return [today];
  }

  const previous = shiftDateFromOffset(today, -1);
  return [today, previous];
}

export function selectActiveAttendanceRecord<
  T extends { date: string; checkInTime: Date | null; checkOutTime: Date | null },
>(
  records: T[],
  emp: Pick<
    EmployeeRow,
    "officeStartTime" | "officeEndTime" | "positionType"
  >,
  now: Date,
): T | undefined {
  if (records.length === 0) {
    return undefined;
  }

  const openRecord = records.find(
    (record) =>
      !!record.checkInTime &&
      !record.checkOutTime &&
      !isMissingCheckoutAbsent(record, emp, now),
  );
  if (openRecord) {
    return openRecord;
  }

  const resolvedShiftDate = resolveAttendanceShiftDate(emp, now);
  return records.find((record) => record.date === resolvedShiftDate);
}

export function officeStartForShiftDate(
  emp: Pick<EmployeeRow, "officeStartTime">,
  shiftDate: string,
): Date {
  return shiftStartDate(shiftDate, emp.officeStartTime);
}

export function officeEndForShiftDate(
  emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">,
  shiftDate: string,
): Date {
  const { h, m } = parseHHMM(emp.officeEndTime);
  const start = shiftStartDate(shiftDate, emp.officeStartTime);
  const end = new Date(start);
  end.setTime(
    Date.UTC(
      end.getUTCFullYear(),
      end.getUTCMonth(),
      end.getUTCDate(),
      h,
      m,
    ) - ATTENDANCE_TIMEZONE_OFFSET_MINUTES * 60_000,
  );
  if (isOvernightShift(emp)) {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return end;
}

export function isMissingCheckoutAbsent(
  record: Pick<AttendanceLike, "date" | "checkInTime" | "checkOutTime" | "notes">,
  emp: Pick<
    EmployeeRow,
    "officeStartTime" | "officeEndTime" | "positionType"
  >,
  now: Date = new Date(),
) {
  if (emp.positionType !== "onsite") return false;
  if (record.notes?.includes(ATTENDANCE_REMOTE_WORK_MODE_TAG)) return false;
  if (!record.checkInTime || record.checkOutTime) return false;
  if (hasManualAttendanceOverride(record.notes)) return false;
  return now.getTime() > officeEndForShiftDate(emp, record.date).getTime();
}

export function deriveAttendanceNotes(
  record: Pick<AttendanceLike, "date" | "checkInTime" | "checkOutTime" | "notes">,
  emp: Pick<
    EmployeeRow,
    "officeStartTime" | "officeEndTime" | "positionType"
  >,
  now: Date = new Date(),
) {
  if (!isMissingCheckoutAbsent(record, emp, now)) {
    return record.notes ?? null;
  }
  if (record.notes?.includes(MISSING_CHECKOUT_ABSENT_NOTE)) {
    return record.notes;
  }
  return record.notes?.trim()
    ? `${record.notes}\n${MISSING_CHECKOUT_ABSENT_NOTE}`
    : MISSING_CHECKOUT_ABSENT_NOTE;
}

export function hasManualAttendanceOverride(notes?: string | null) {
  return typeof notes === "string" && notes.startsWith(MANUAL_OVERRIDE_NOTE_PREFIX);
}

export function markManualAttendanceOverride(notes?: string | null) {
  const cleanNotes = clearManualAttendanceOverride(notes);
  return cleanNotes
    ? `${MANUAL_OVERRIDE_NOTE_PREFIX} ${cleanNotes}`
    : MANUAL_OVERRIDE_NOTE_PREFIX;
}

export function clearManualAttendanceOverride(notes?: string | null) {
  if (typeof notes !== "string" || notes.length === 0) return null;
  if (!notes.startsWith(MANUAL_OVERRIDE_NOTE_PREFIX)) return notes;
  const trimmed = notes
    .slice(MANUAL_OVERRIDE_NOTE_PREFIX.length)
    .trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeAttendanceStatus(
  record: AttendanceLike,
  emp: Pick<
    EmployeeRow,
    | "officeStartTime"
    | "officeEndTime"
    | "gracePeriodMinutes"
    | "breakMinutes"
    | "positionType"
  >,
) {
  if (record.status === "on_leave") {
    return {
      status: record.status,
      isLate: record.isLate,
    };
  }

  if (record.status === "remote_work") {
    return {
      status: "remote_work",
      isLate: false,
    };
  }

  if (hasManualAttendanceOverride(record.notes)) {
    return {
      status: record.status,
      isLate: record.status === "late",
    };
  }

  const officeStart = officeStartForShiftDate(emp, record.date);
  const graceCutoff = new Date(
    officeStart.getTime() + emp.gracePeriodMinutes * 60_000,
  );
  const inferredLate = record.checkInTime
    ? record.checkInTime.getTime() > graceCutoff.getTime()
    : record.isLate || record.status === "late";

  if (!record.checkInTime) {
    return {
      status: record.status,
      isLate: false,
    };
  }

  if (isMissingCheckoutAbsent(record, emp)) {
    return {
      status: "absent",
      isLate: false,
    };
  }

  if (!record.checkOutTime || record.workedMinutes == null) {
    return {
      status: inferredLate ? "late" : "present",
      isLate: inferredLate,
    };
  }

  const fullDayMinutes = officeMinutes(emp);
  if (fullDayMinutes <= 0) {
    return {
      status: inferredLate ? "late" : record.status,
      isLate: inferredLate,
    };
  }

  if (record.workedMinutes < fullDayMinutes / 4) {
    return {
      status: "absent",
      isLate: false,
    };
  }

  if (record.workedMinutes < fullDayMinutes / 2) {
    return {
      status: "half_day",
      isLate: inferredLate,
    };
  }

  if (inferredLate) {
    return {
      status: "late",
      isLate: true,
    };
  }

  return {
    status: "present",
    isLate: false,
  };
}
