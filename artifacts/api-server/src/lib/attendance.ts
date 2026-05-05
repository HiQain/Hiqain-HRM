import { type employeesTable } from "@workspace/db";
import { parseDate, parseHHMM, ymd } from "./dates";

type EmployeeRow = typeof employeesTable.$inferSelect;

function minutesFromHHMM(value: string): number {
  const { h, m } = parseHHMM(value);
  return h * 60 + m;
}

function shiftStartDate(dateStr: string, officeStartTime: string): Date {
  const { h, m } = parseHHMM(officeStartTime);
  const date = parseDate(dateStr);
  date.setUTCHours(h, m, 0, 0);
  return date;
}

export function isOvernightShift(emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">): boolean {
  return minutesFromHHMM(emp.officeEndTime) <= minutesFromHHMM(emp.officeStartTime);
}

export function officeMinutes(emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">): number {
  const startMinutes = minutesFromHHMM(emp.officeStartTime);
  const endMinutes = minutesFromHHMM(emp.officeEndTime);
  if (endMinutes <= startMinutes) {
    return 24 * 60 - startMinutes + endMinutes;
  }
  return endMinutes - startMinutes;
}

export function resolveAttendanceShiftDate(
  emp: Pick<EmployeeRow, "officeStartTime" | "officeEndTime">,
  now: Date,
): string {
  const today = ymd(now);
  if (!isOvernightShift(emp)) return today;

  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const endMinutes = minutesFromHHMM(emp.officeEndTime);
  if (nowMinutes <= endMinutes) {
    return ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  }
  return today;
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
  end.setUTCHours(h, m, 0, 0);
  if (isOvernightShift(emp)) {
    end.setUTCDate(end.getUTCDate() + 1);
  }
  return end;
}
