import { attendanceTable, db, employeesTable } from "@workspace/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  markAttendanceAutoCheckout,
  normalizeAttendanceStatus,
  resolveAttendanceRecordTiming,
} from "./attendance";
import { logger } from "./logger";

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

export async function persistAttendanceAutoCheckout(
  attendance: typeof attendanceTable.$inferSelect,
  employee: typeof employeesTable.$inferSelect,
  now: Date = new Date(),
): Promise<boolean> {
  const resolved = resolveAttendanceRecordTiming(attendance, employee, now);
  if (!resolved.isAutoCheckoutApplied || !resolved.checkOutTime) return false;

  const notes = markAttendanceAutoCheckout(attendance.notes);
  const normalized = normalizeAttendanceStatus(
    {
      ...attendance,
      checkOutTime: resolved.checkOutTime,
      workedMinutes: resolved.workedMinutes,
      notes,
    },
    employee,
  );

  const result = await db
    .update(attendanceTable)
    .set({
      checkOutTime: resolved.checkOutTime,
      workedMinutes: resolved.workedMinutes,
      pausedAt: null,
      pausedMinutes: resolved.pausedMinutes,
      status: normalized.status as typeof attendanceTable.$inferInsert.status,
      isLate: normalized.isLate,
      notes,
    })
    .where(
      and(
        eq(attendanceTable.id, attendance.id),
        isNull(attendanceTable.checkOutTime),
      ),
    );

  return result[0].affectedRows > 0;
}

/**
 * Persists every attendance row whose employee-specific shift ended at least
 * six hours ago. The guarded primary-key update makes this safe when more than
 * one API process runs the sweep at the same time.
 */
export async function reconcileOverdueAttendance(
  now: Date = new Date(),
): Promise<number> {
  const openRows = await db
    .select({
      attendance: attendanceTable,
      employee: employeesTable,
    })
    .from(attendanceTable)
    .innerJoin(
      employeesTable,
      eq(attendanceTable.employeeId, employeesTable.id),
    )
    .where(
      and(
        isNotNull(attendanceTable.checkInTime),
        isNull(attendanceTable.checkOutTime),
      ),
    );

  let updatedCount = 0;

  for (const { attendance, employee } of openRows) {
    if (await persistAttendanceAutoCheckout(attendance, employee, now)) {
      updatedCount += 1;
    }
  }

  return updatedCount;
}

export function startAttendanceAutoCheckoutJob(
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
) {
  let isRunning = false;

  const runSweep = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const updatedCount = await reconcileOverdueAttendance();
      if (updatedCount > 0) {
        logger.info(
          { updatedCount },
          "Persisted overdue attendance auto-checkouts",
        );
      }
    } catch (error) {
      logger.error({ err: error }, "Attendance auto-checkout sweep failed");
    } finally {
      isRunning = false;
    }
  };

  void runSweep();
  const timer = setInterval(() => void runSweep(), intervalMs);
  timer.unref();

  return () => clearInterval(timer);
}
