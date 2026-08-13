import { attendanceTable, db, employeesTable } from "@workspace/db";
import { and, eq, isNotNull, isNull, like, notLike, or } from "drizzle-orm";
import {
  ATTENDANCE_AUTO_CHECKOUT_TAG,
  hasAttendanceAutoCheckout,
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
  if (hasAttendanceAutoCheckout(attendance.notes)) return true;

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
      checkOutTime: null,
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
        or(
          isNull(attendanceTable.notes),
          notLike(
            attendanceTable.notes,
            `%${ATTENDANCE_AUTO_CHECKOUT_TAG}%`,
          ),
        ),
      ),
    );

  if (result[0].affectedRows > 0) return true;

  const currentRows = await db
    .select({ notes: attendanceTable.notes })
    .from(attendanceTable)
    .where(eq(attendanceTable.id, attendance.id))
    .limit(1);

  return hasAttendanceAutoCheckout(currentRows[0]?.notes);
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
        or(
          isNull(attendanceTable.notes),
          notLike(
            attendanceTable.notes,
            `%${ATTENDANCE_AUTO_CHECKOUT_TAG}%`,
          ),
        ),
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

export async function clearPersistedAutoCheckoutTimes(): Promise<number> {
  const result = await db
    .update(attendanceTable)
    .set({ checkOutTime: null })
    .where(
      and(
        isNotNull(attendanceTable.checkOutTime),
        like(
          attendanceTable.notes,
          `%${ATTENDANCE_AUTO_CHECKOUT_TAG}%`,
        ),
      ),
    );

  return result[0].affectedRows;
}

export function startAttendanceAutoCheckoutJob(
  intervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
) {
  let isRunning = false;
  let legacyTimesCleared = false;

  const runSweep = async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const clearedCheckoutCount = legacyTimesCleared
        ? 0
        : await clearPersistedAutoCheckoutTimes();
      legacyTimesCleared = true;
      const updatedCount = await reconcileOverdueAttendance();
      if (clearedCheckoutCount > 0 || updatedCount > 0) {
        logger.info(
          { clearedCheckoutCount, updatedCount },
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
