import { attendanceTable, db, employeesTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  attendanceCandidateShiftDates,
  normalizeAttendanceStatus,
  officeMinutes,
  selectActiveAttendanceRecord,
} from "./attendance";

type AttendanceEmployee = typeof employeesTable.$inferSelect;
type AttendanceRecord = typeof attendanceTable.$inferSelect;

function appendAttendanceNote(
  existing: string | null,
  tag: string,
  details?: string,
) {
  const next = details ? `[${tag}] ${details}` : `[${tag}]`;
  if (existing?.includes(next)) return existing;
  return existing?.trim() ? `${existing}\n${next}` : next;
}

export async function loadAttendanceContext(employeeId: number, now = new Date()) {
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const employee = empRows[0];
  if (!employee) return null;

  const candidateDates = attendanceCandidateShiftDates(employee, now);
  const records = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, employeeId),
        inArray(attendanceTable.date, candidateDates),
      ),
    )
    .orderBy(attendanceTable.date);

  return {
    employee,
    record: selectActiveAttendanceRecord(records, employee, now) ?? null,
  };
}

export async function autoPauseAttendance(
  employeeId: number,
  now: Date,
  reason = "Auto paused after inactivity detected by browser extension.",
  tag = "auto_paused_idle",
) {
  const context = await loadAttendanceContext(employeeId, now);
  if (!context?.record?.checkInTime || context.record.checkOutTime || context.record.pausedAt) {
    return { changed: false, context };
  }

  await db
    .update(attendanceTable)
    .set({
      pausedAt: now,
      notes: appendAttendanceNote(context.record.notes, tag, reason),
    })
    .where(eq(attendanceTable.id, context.record.id));

  return { changed: true, context };
}

export async function autoResumeAttendance(
  employeeId: number,
  now: Date,
  reason = "Auto resumed after activity was detected by browser extension.",
  tag = "auto_resumed_activity",
) {
  const context = await loadAttendanceContext(employeeId, now);
  const record = context?.record;
  if (!record?.checkInTime || record.checkOutTime || !record.pausedAt) {
    return { changed: false, context };
  }

  const pausedThisSession = Math.max(
    0,
    Math.floor((now.getTime() - record.pausedAt.getTime()) / 60000),
  );
  await db
    .update(attendanceTable)
    .set({
      pausedAt: null,
      pausedMinutes: (record.pausedMinutes ?? 0) + pausedThisSession,
      notes: appendAttendanceNote(record.notes, tag, reason),
    })
    .where(eq(attendanceTable.id, record.id));

  return { changed: true, context };
}

export async function autoCheckOutAttendance(
  employeeId: number,
  now: Date,
  reason = "Auto checked out after prolonged inactivity detected by browser extension.",
  tag = "auto_checkout_idle",
) {
  const context = await loadAttendanceContext(employeeId, now);
  const employee = context?.employee;
  const record = context?.record;
  if (!employee || !record?.checkInTime || record.checkOutTime) {
    return { changed: false, context };
  }

  const activePauseMinutes = record.pausedAt
    ? Math.max(0, Math.floor((now.getTime() - record.pausedAt.getTime()) / 60000))
    : 0;
  const workedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - record.checkInTime.getTime()) / 60000) -
      (record.pausedMinutes ?? 0) -
      activePauseMinutes,
  );
  const normalized = normalizeAttendanceStatus(
    {
      date: record.date,
      status: record.status,
      isLate: record.isLate,
      checkInTime: record.checkInTime,
      checkOutTime: now,
      workedMinutes,
      notes: record.notes,
    },
    employee,
  );

  await db
    .update(attendanceTable)
    .set({
      checkOutTime: now,
      workedMinutes,
      pausedAt: null,
      status: normalized.status as typeof attendanceTable.$inferInsert.status,
      isLate: normalized.isLate,
      notes: appendAttendanceNote(record.notes, tag, reason),
    })
    .where(eq(attendanceTable.id, record.id));

  return { changed: true, context };
}

export function attendanceSessionState(record: AttendanceRecord | null) {
  if (!record?.checkInTime) return "none" as const;
  if (record.checkOutTime) return "checked_out" as const;
  if (record.pausedAt) return "paused" as const;
  return "active" as const;
}

export function fullShiftMinutesFor(employee: AttendanceEmployee) {
  return officeMinutes(employee);
}
