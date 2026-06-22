import { Router, type IRouter } from "express";
import {
  db,
  attendanceTable,
  employeesTable,
  leaveRequestsTable,
  remoteWorkRequestsTable,
} from "@workspace/db";
import { and, eq, gte, lte } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { ymd } from "../lib/dates";
import {
  attendanceCandidateShiftDates,
  attendanceTodayYmd,
  clearManualAttendanceOverride,
  deriveAttendanceNotes,
  markManualAttendanceOverride,
  normalizeAttendanceStatus,
  officeMinutes,
  officeEndForShiftDate,
  officeStartForShiftDate,
  resolveAttendanceShiftDate,
  selectActiveAttendanceRecord,
  shiftDateByDays,
  isOvernightShift,
} from "../lib/attendance";
import { isPayrollOffDay, toHolidaySet } from "../lib/payroll";
import { getSettings } from "./settings";
import { inArray } from "drizzle-orm";

const router: IRouter = Router();

function resolveOverrideAttendanceFields(
  employee: Pick<
    typeof employeesTable.$inferSelect,
    "officeStartTime" | "officeEndTime" | "gracePeriodMinutes" | "breakMinutes"
  >,
  date: string,
  status: string,
  existing?: typeof attendanceTable.$inferSelect,
) {
  const shiftStart = officeStartForShiftDate(employee, date);
  const shiftEnd = officeEndForShiftDate(employee, date);
  const fullShiftMinutes = officeMinutes(employee);
  const lateStart = new Date(
    shiftStart.getTime() + (employee.gracePeriodMinutes + 1) * 60_000,
  );

  if (status === "absent") {
    return {
      checkInTime: null,
      checkOutTime: null,
      workedMinutes: 0,
    };
  }

  if (status === "half_day") {
    return {
      checkInTime: existing?.checkInTime ?? shiftStart,
      checkOutTime: existing?.checkOutTime ?? shiftEnd,
      workedMinutes: Math.max(1, Math.round(fullShiftMinutes / 2)),
    };
  }

  if (status === "late") {
    return {
      checkInTime: existing?.checkInTime ?? lateStart,
      checkOutTime: existing?.checkOutTime ?? shiftEnd,
      workedMinutes: fullShiftMinutes,
    };
  }

  if (status === "present" || status === "remote_work" || status === "on_leave") {
    return {
      checkInTime: existing?.checkInTime ?? shiftStart,
      checkOutTime: existing?.checkOutTime ?? shiftEnd,
      workedMinutes: fullShiftMinutes,
    };
  }

  return {
    checkInTime: existing?.checkInTime ?? null,
    checkOutTime: existing?.checkOutTime ?? null,
    workedMinutes: existing?.workedMinutes ?? 0,
  };
}

function resolveDefaultWorkMode(
  employee?: Pick<typeof employeesTable.$inferSelect, "positionType">,
): "onsite" | "remote_work" {
  return employee?.positionType === "remote" ? "remote_work" : "onsite";
}

const WORK_MODE_NOTE_TAG = "[attendance_work_mode:";

function extractWorkModeOverride(notes?: string | null): "onsite" | "remote_work" | null {
  if (!notes) return null;
  const remoteTag = `${WORK_MODE_NOTE_TAG}remote_work]`;
  const onsiteTag = `${WORK_MODE_NOTE_TAG}onsite]`;
  if (notes.includes(remoteTag)) return "remote_work";
  if (notes.includes(onsiteTag)) return "onsite";
  return null;
}

function stripWorkModeOverride(notes?: string | null): string | null {
  if (!notes) return null;
  const stripped = notes
    .replace(`${WORK_MODE_NOTE_TAG}remote_work]`, "")
    .replace(`${WORK_MODE_NOTE_TAG}onsite]`, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return stripped.length > 0 ? stripped : null;
}

function setWorkModeOverrideNote(
  notes: string | null | undefined,
  workMode: "onsite" | "remote_work" | null,
): string | null {
  const base = stripWorkModeOverride(notes);
  if (!workMode) return base;
  return base ? `${base}\n${WORK_MODE_NOTE_TAG}${workMode}]` : `${WORK_MODE_NOTE_TAG}${workMode}]`;
}

function resolveAttendanceWorkMode(
  record: Pick<typeof attendanceTable.$inferSelect, "status" | "workMode" | "notes">,
  employee?: Pick<typeof employeesTable.$inferSelect, "positionType">,
): "onsite" | "remote_work" {
  return extractWorkModeOverride(record.notes) ??
    record.workMode ??
    (record.status === "remote_work" ? "remote_work" : resolveDefaultWorkMode(employee));
}

function serializeAttendanceStatus(
  status: string,
  isLate: boolean,
): string {
  if (status === "remote_work") {
    return isLate ? "late" : "present";
  }
  return status;
}

function serializeRecord(
  r: typeof attendanceTable.$inferSelect,
  employeeName: string,
  employee?: Pick<
    typeof employeesTable.$inferSelect,
    | "officeStartTime"
    | "officeEndTime"
    | "gracePeriodMinutes"
    | "breakMinutes"
    | "positionType"
  >,
) {
  const normalized = employee ? normalizeAttendanceStatus(r, employee) : null;
  const serializedStatus = serializeAttendanceStatus(
    normalized?.status ?? r.status,
    normalized?.isLate ?? r.isLate,
  );
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    date: r.date,
    checkInTime: r.checkInTime ? r.checkInTime.toISOString() : null,
    checkOutTime: r.checkOutTime ? r.checkOutTime.toISOString() : null,
    workedMinutes: r.workedMinutes,
    pausedAt: r.pausedAt ? r.pausedAt.toISOString() : null,
    pausedMinutes: r.pausedMinutes ?? 0,
    isPaused: Boolean(r.pausedAt && !r.checkOutTime),
    status: serializedStatus,
    workMode: resolveAttendanceWorkMode(r, employee),
    isLate: normalized?.isLate ?? r.isLate,
    excused: r.excused,
    notes: employee ? deriveAttendanceNotes(r, employee) : r.notes,
  };
}

router.post(
  "/attendance/check-in",
  requireAuth(["employee", "hr"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const now = new Date();
    const shiftDate = resolveAttendanceShiftDate(emp, now);
    const candidateDates = attendanceCandidateShiftDates(emp, now);

    const existing = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          inArray(attendanceTable.date, candidateDates),
        ),
      )
      .orderBy(attendanceTable.date);

    const activeRecord = selectActiveAttendanceRecord(existing, emp, now);
    const existingForShiftDate =
      existing.find((record) => record.date === shiftDate) ?? null;

    if (activeRecord?.checkInTime && !activeRecord.checkOutTime) {
      res.status(400).json({ message: "Already checked in for the active shift" });
      return;
    }

    if (existingForShiftDate?.checkInTime) {
      res.status(400).json({ message: "Already checked in today" });
      return;
    }

    // Block check-in if on approved leave today
    const leaveOnDay = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.employeeId, user.employeeId),
          eq(leaveRequestsTable.status, "approved"),
          lte(leaveRequestsTable.startDate, shiftDate),
          gte(leaveRequestsTable.endDate, shiftDate),
        ),
      )
      .limit(1);
    if (leaveOnDay.length) {
      res.status(400).json({
        message: "You are on approved leave today and cannot check in.",
      });
      return;
    }

    // Determine if today is an approved remote work day
    const remoteApproved = await db
      .select()
      .from(remoteWorkRequestsTable)
      .where(
        and(
          eq(remoteWorkRequestsTable.employeeId, user.employeeId),
          eq(remoteWorkRequestsTable.date, shiftDate),
          eq(remoteWorkRequestsTable.status, "approved"),
        ),
      )
      .limit(1);

    const isRemoteToday =
      emp.positionType === "remote" || remoteApproved.length > 0;
    const defaultWorkMode = resolveDefaultWorkMode(emp);
    const effectiveWorkMode: "onsite" | "remote_work" = isRemoteToday
      ? "remote_work"
      : "onsite";
    const persistedWorkMode =
      effectiveWorkMode === defaultWorkMode ? null : effectiveWorkMode;

    const officeStart = officeStartForShiftDate(emp, shiftDate);
    const graceCutoff = new Date(
      officeStart.getTime() + emp.gracePeriodMinutes * 60_000,
    );
    const isLate = now > graceCutoff;

    const status: "present" | "late" = isLate ? "late" : "present";

    let record;
    if (existingForShiftDate) {
      await db
        .update(attendanceTable)
        .set({
          checkInTime: now,
          isLate,
          status,
          notes: setWorkModeOverrideNote(
            clearManualAttendanceOverride(existingForShiftDate.notes),
            persistedWorkMode,
          ),
          pausedAt: null,
          pausedMinutes: 0,
        })
        .where(eq(attendanceTable.id, existingForShiftDate.id));
      const updatedRows = await db
        .select()
        .from(attendanceTable)
        .where(eq(attendanceTable.id, existingForShiftDate.id))
        .limit(1);
      record = updatedRows[0]!;
    } else {
      const inserted = await db
        .insert(attendanceTable)
        .values({
          employeeId: user.employeeId,
          date: shiftDate,
          checkInTime: now,
          isLate,
          status,
          notes: setWorkModeOverrideNote(null, persistedWorkMode),
          pausedAt: null,
          pausedMinutes: 0,
        })
        .$returningId();
      const recordId = inserted[0]?.id;
      const insertedRows = recordId
        ? await db
            .select()
            .from(attendanceTable)
            .where(eq(attendanceTable.id, recordId))
            .limit(1)
        : [];
      record = insertedRows[0]!;
    }
    res.json(serializeRecord(record, emp.name, emp));
  },
);

router.post(
  "/attendance/check-out",
  requireAuth(["employee", "hr"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const now = new Date();
    const candidateDates = attendanceCandidateShiftDates(emp, now);

    const settings = await getSettings();
    const holidaySet = toHolidaySet(settings);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          inArray(attendanceTable.date, candidateDates),
        ),
      )
      .orderBy(attendanceTable.date);

    const rec = selectActiveAttendanceRecord(rows, emp, now);

    if (!rec?.checkInTime) {
      res.status(400).json({ message: "You haven't checked in for this shift" });
      return;
    }
    const activePauseMinutes = rec.pausedAt
      ? Math.max(0, Math.floor((now.getTime() - rec.pausedAt.getTime()) / 60000))
      : 0;
    const worked = Math.max(
      0,
      Math.floor(
        (now.getTime() - rec.checkInTime!.getTime()) / 60000,
      ) - (rec.pausedMinutes ?? 0) - activePauseMinutes,
    );

    // Attendance thresholds:
    // - under 25% of the shift => absent
    // - under 50% of the shift => half-day
    const fullDayMinutes = officeMinutes(emp);
    const normalized = normalizeAttendanceStatus(
      {
        date: rec.date,
        status: rec.status,
        isLate: rec.isLate,
        checkInTime: rec.checkInTime,
        checkOutTime: now,
        workedMinutes: worked,
      },
      emp,
    );

    await db
      .update(attendanceTable)
      .set({
        checkOutTime: now,
        workedMinutes: worked,
        pausedAt: null,
        status: normalized.status as typeof attendanceTable.$inferInsert.status,
        isLate: normalized.isLate,
        notes: clearManualAttendanceOverride(rec.notes),
      })
      .where(eq(attendanceTable.id, rec.id));
    const updatedRows = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.id, rec.id))
      .limit(1);
    res.json(serializeRecord(updatedRows[0]!, emp.name, emp));
  },
);

router.get(
  "/attendance/today",
  requireAuth(["employee", "hr"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.json({
        hasCheckedIn: false,
        hasCheckedOut: false,
        isPaused: false,
        record: null,
      });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const now = new Date();
    const candidateDates = attendanceCandidateShiftDates(emp, now);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          inArray(attendanceTable.date, candidateDates),
        ),
      )
      .orderBy(attendanceTable.date);
    const activeRecord = selectActiveAttendanceRecord(rows, emp, now);
    if (!activeRecord) {
      res.json({
        hasCheckedIn: false,
        hasCheckedOut: false,
        isPaused: false,
        record: null,
      });
      return;
    }
    const r = activeRecord;
    res.json({
      hasCheckedIn: !!r.checkInTime,
      hasCheckedOut: !!r.checkOutTime,
      isPaused: !!r.pausedAt && !r.checkOutTime,
      record: serializeRecord(r, emp.name, emp),
    });
  },
);

function monthRange(month?: string): {
  start: string;
  end: string;
  year: number;
  month: number;
} {
  const now = new Date();
  let y: number;
  let m: number;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [yr, mo] = month.split("-").map(Number);
    y = yr!;
    m = mo!;
  } else {
    y = now.getUTCFullYear();
    m = now.getUTCMonth() + 1;
  }
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(y, m, 0));
  const end = ymd(endDate);
  return { start, end, year: y, month: m };
}

function summaryQueryDates(targetDate: string, operationalToday: string): string[] {
  if (targetDate !== operationalToday) {
    return [targetDate];
  }
  return [targetDate, shiftDateByDays(targetDate, -1)];
}

router.post(
  "/attendance/pause",
  requireAuth(["employee", "hr"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const now = new Date();
    const candidateDates = attendanceCandidateShiftDates(emp, now);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          inArray(attendanceTable.date, candidateDates),
        ),
      )
      .orderBy(attendanceTable.date);

    const rec = selectActiveAttendanceRecord(rows, emp, now);

    if (!rec?.checkInTime) {
      res.status(400).json({ message: "You need to check in first" });
      return;
    }
    if (rec.checkOutTime) {
      res.status(400).json({ message: "You have already checked out" });
      return;
    }
    if (rec.pausedAt) {
      res.status(400).json({ message: "Attendance is already paused" });
      return;
    }

    await db
      .update(attendanceTable)
      .set({ pausedAt: now })
      .where(eq(attendanceTable.id, rec.id));
    const updatedRows = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.id, rec.id))
      .limit(1);
    res.json(serializeRecord(updatedRows[0]!, emp.name));
  },
);

router.post(
  "/attendance/resume",
  requireAuth(["employee", "hr"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const now = new Date();
    const candidateDates = attendanceCandidateShiftDates(emp, now);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          inArray(attendanceTable.date, candidateDates),
        ),
      )
      .orderBy(attendanceTable.date);

    const rec = selectActiveAttendanceRecord(rows, emp, now);

    if (!rec?.checkInTime) {
      res.status(400).json({ message: "You need to check in first" });
      return;
    }
    if (rec.checkOutTime) {
      res.status(400).json({ message: "You have already checked out" });
      return;
    }
    if (!rec.pausedAt) {
      res.status(400).json({ message: "Attendance is not paused" });
      return;
    }

    const pausedThisSession = Math.max(
      0,
      Math.floor((now.getTime() - rec.pausedAt.getTime()) / 60000),
    );
    await db
      .update(attendanceTable)
      .set({
        pausedAt: null,
        pausedMinutes: (rec.pausedMinutes ?? 0) + pausedThisSession,
      })
      .where(eq(attendanceTable.id, rec.id));
    const updatedRows = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.id, rec.id))
      .limit(1);
    res.json(serializeRecord(updatedRows[0]!, emp.name));
  },
);

router.get("/attendance/me", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.json([]);
    return;
  }
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;
  const { start, end } = monthRange(req.query.month as string | undefined);
  const rows = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, user.employeeId),
        gte(attendanceTable.date, start),
        lte(attendanceTable.date, end),
      ),
    )
    .orderBy(attendanceTable.date);
  res.json(rows.map((r) => serializeRecord(r, emp.name, emp)));
});

router.get(
  "/attendance/employee/:id",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id))
      .limit(1);
    if (!empRows.length) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }
    const emp = empRows[0]!;
    const { start, end } = monthRange(req.query.month as string | undefined);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, id),
          gte(attendanceTable.date, start),
          lte(attendanceTable.date, end),
        ),
      )
      .orderBy(attendanceTable.date);
    res.json(rows.map((r) => serializeRecord(r, emp.name, emp)));
  },
);

router.get(
  "/attendance/today-summary",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const now = new Date();
    const dateParam = typeof req.query.date === "string" ? req.query.date : "";
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
    const allEmps = await db.select().from(employeesTable);
    const today = attendanceTodayYmd(now);
    const targetDate = isValidDate ? dateParam : today;
    const queryDates = summaryQueryDates(targetDate, today);
    const settings = await getSettings();
    const holidaySet = toHolidaySet(settings);
    const targetDow = new Date(`${targetDate}T00:00:00Z`).getUTCDay();
    const isWeeklyOff = (settings.weeklyOffDays ?? [0, 6]).includes(targetDow);
    const isHoliday = holidaySet.has(targetDate);

    const records = await db
      .select()
      .from(attendanceTable)
      .where(inArray(attendanceTable.date, queryDates));
    const recMap = new Map<number, Array<typeof attendanceTable.$inferSelect>>();
    for (const record of records) {
      const employeeRecords = recMap.get(record.employeeId) ?? [];
      employeeRecords.push(record);
      recMap.set(record.employeeId, employeeRecords);
    }

    // Approved leaves overlapping the target date
    const leaveRows = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.status, "approved"),
          lte(leaveRequestsTable.startDate, targetDate),
          gte(leaveRequestsTable.endDate, targetDate),
        ),
      );
    const leaveMap = new Set(leaveRows.map((l) => l.employeeId));

    const isFuture = targetDate > today;

    const out: Array<ReturnType<typeof serializeRecord>> = [];
    let present = 0;
    let late = 0;
    let absent = 0;
    let onLeave = 0;
    let halfDay = 0;
    let remoteWork = 0;
    for (const emp of allEmps) {
      const employeeRecords = recMap.get(emp.id) ?? [];
      const r =
        targetDate === today
          ? selectActiveAttendanceRecord(employeeRecords, emp, now)
          : employeeRecords.find((record) => record.date === targetDate);
      if (targetDate < emp.joiningDate) {
        out.push({
          id: -emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          date: targetDate,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: null,
          pausedAt: null,
          pausedMinutes: 0,
          isPaused: false,
          status: "none",
          workMode: resolveDefaultWorkMode(emp),
          isLate: false,
          excused: false,
          notes: null,
        });
      } else if (isHoliday) {
        out.push({
          id: -(emp.id * 10),
          employeeId: emp.id,
          employeeName: emp.name,
          date: targetDate,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: null,
          pausedAt: null,
          pausedMinutes: 0,
          isPaused: false,
          status: "holiday",
          workMode: resolveDefaultWorkMode(emp),
          isLate: false,
          excused: false,
          notes: null,
        });
      } else if (isWeeklyOff) {
        out.push({
          id: -(emp.id * 100),
          employeeId: emp.id,
          employeeName: emp.name,
          date: targetDate,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: null,
          pausedAt: null,
          pausedMinutes: 0,
          isPaused: false,
          status: "weekend",
          workMode: resolveDefaultWorkMode(emp),
          isLate: false,
          excused: false,
          notes: null,
        });
      } else if (r) {
        const normalized = normalizeAttendanceStatus(r, emp);
        if (normalized.status === "present") present += 1;
        else if (normalized.status === "late") late += 1;
        else if (normalized.status === "on_leave") onLeave += 1;
        else if (normalized.status === "half_day") halfDay += 1;
        else absent += 1;
        if (resolveAttendanceWorkMode(r, emp) === "remote_work") remoteWork += 1;
        out.push(serializeRecord(r, emp.name, emp));
      } else if (isFuture) {
        // Don't fabricate "absent" rows for future dates.
        out.push({
          id: -emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          date: targetDate,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: null,
          pausedAt: null,
          pausedMinutes: 0,
          isPaused: false,
          status: "future",
          workMode: resolveDefaultWorkMode(emp),
          isLate: false,
          excused: false,
          notes: null,
        });
      } else if (leaveMap.has(emp.id)) {
        onLeave += 1;
        out.push({
          id: -emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          date: targetDate,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: null,
          pausedAt: null,
          pausedMinutes: 0,
          isPaused: false,
          status: "on_leave",
          workMode: resolveDefaultWorkMode(emp),
          isLate: false,
          excused: false,
          notes: null,
        });
      } else {
        absent += 1;
        out.push({
          id: -emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          date: targetDate,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: null,
          pausedAt: null,
          pausedMinutes: 0,
          isPaused: false,
          status: "absent",
          workMode: resolveDefaultWorkMode(emp),
          isLate: false,
          excused: false,
          notes: null,
        });
      }
    }

    res.json({
      date: targetDate,
      total: allEmps.length,
      present,
      late,
      absent,
      onLeave,
      halfDay,
      remoteWork,
      records: out,
    });
  },
);

// Calendar view for one employee for a given month
router.get(
  "/attendance/calendar",
  requireAuth(),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    const queryEmpId = req.query.employeeId
      ? Number(req.query.employeeId)
      : user.employeeId;
    if (!queryEmpId) {
      res.status(400).json({ message: "employeeId required" });
      return;
    }
    if (user.role === "employee" && user.employeeId !== queryEmpId) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, queryEmpId))
      .limit(1);
    const emp = empRows[0];
    if (!emp) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }
    const settings = await getSettings();
    const holidaySet = toHolidaySet(settings);
    const weeklyOffDays = new Set(settings.weeklyOffDays ?? [0, 6]);

    const { start, end, year, month } = monthRange(
      req.query.month as string | undefined,
    );

    const records = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, queryEmpId),
          gte(attendanceTable.date, start),
          lte(attendanceTable.date, end),
        ),
      );
    const recMap = new Map(records.map((r) => [r.date, r]));

    // Approved leaves in the month
    const leaves = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.employeeId, queryEmpId),
          eq(leaveRequestsTable.status, "approved"),
          lte(leaveRequestsTable.startDate, end),
          gte(leaveRequestsTable.endDate, start),
        ),
      );
    const leaveDates = new Set<string>();
    for (const l of leaves) {
      const s = new Date(l.startDate + "T00:00:00Z").getTime();
      const e = new Date(l.endDate + "T00:00:00Z").getTime();
      for (let t = s; t <= e; t += 86400000) {
        const d = ymd(new Date(t));
        if (d >= start && d <= end) leaveDates.add(d);
      }
    }

    const todayStr = attendanceTodayYmd();
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const days: Array<{
      date: string;
      status: string;
      record: ReturnType<typeof serializeRecord> | null;
    }> = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
      const r = recMap.get(dateStr);
      let status: string;
      if (dateStr < emp.joiningDate) {
        status = "none";
      } else if (holidaySet.has(dateStr)) {
        status = "holiday";
      } else if (weeklyOffDays.has(dow)) {
        status = "weekend";
      } else if (leaveDates.has(dateStr)) {
        status = "on_leave";
      } else if (r) {
        status = normalizeAttendanceStatus(r, emp).status;
      } else if (dateStr > todayStr) {
        status = "future";
      } else {
        status = "absent";
      }
      days.push({
        date: dateStr,
        status,
        record: r ? serializeRecord(r, emp.name, emp) : null,
      });
    }

    res.json({
      employeeId: emp.id,
      employeeName: emp.name,
      month: `${year}-${String(month).padStart(2, "0")}`,
      days,
    });
  },
);

// List late attendance rows for one employee in a given month (admin/HR)
router.get(
  "/attendance/employee/:id/lates",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid employee id" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id))
      .limit(1);
    const emp = empRows[0];
    if (!emp) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    const settings = await getSettings();
    const holidaySet = toHolidaySet(settings);
    const { start, end } = monthRange(req.query.month as string | undefined);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, id),
          gte(attendanceTable.date, start),
          lte(attendanceTable.date, end),
        ),
      );
    const lates = rows
      .filter((r) => !isPayrollOffDay(r.date, settings, holidaySet))
      .filter((r) => {
        const normalized = normalizeAttendanceStatus(r, emp);
        return normalized.isLate || normalized.status === "late";
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((r) => serializeRecord(r, emp.name, emp));
    res.json(lates);
  },
);

// Admin/HR can excuse (or un-excuse) a single attendance row.
// An excused late row is forgiven by payroll: it doesn't count toward the
// late→absence penalty.
router.post(
  "/attendance/:id/excuse",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Invalid attendance id" });
      return;
    }
    const excused = req.body?.excused;
    if (typeof excused !== "boolean") {
      res
        .status(400)
        .json({ message: "Body must contain { excused: boolean }" });
      return;
    }
    const rows = await db
      .select({
        record: attendanceTable,
        employeeName: employeesTable.name,
      })
      .from(attendanceTable)
      .innerJoin(
        employeesTable,
        eq(employeesTable.id, attendanceTable.employeeId),
      )
      .where(eq(attendanceTable.id, id))
      .limit(1);
    if (!rows.length) {
      res.status(404).json({ message: "Attendance record not found" });
      return;
    }
    await db
      .update(attendanceTable)
      .set({ excused })
      .where(eq(attendanceTable.id, id))
      ;
    const updatedRows = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.id, id))
      .limit(1);
    res.json(serializeRecord(updatedRows[0]!, rows[0]!.employeeName));
  },
);

// Admin override: create or update a record for any employee/date
router.post(
  "/attendance/override",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const { employeeId, date, status, notes } = req.body ?? {};
    if (!employeeId || !date || !status) {
      res
        .status(400)
        .json({ message: "employeeId, date and status required" });
      return;
    }
    const allowed = [
      "present",
      "late",
      "absent",
      "on_leave",
      "half_day",
      "remote_work",
    ];
    if (!allowed.includes(status)) {
      res.status(400).json({ message: "Invalid status" });
      return;
    }

    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, Number(employeeId)))
      .limit(1);
    const emp = empRows[0];
    if (!emp) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    const existing = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, Number(employeeId)),
          eq(attendanceTable.date, date),
        ),
      )
      .limit(1);

    let record;
    if (existing.length) {
      const currentWorkModeOverride = extractWorkModeOverride(existing[0]!.notes);
      const overrideFields = resolveOverrideAttendanceFields(
        emp,
        date,
        status,
        existing[0]!,
      );
      await db
        .update(attendanceTable)
        .set({
          status,
          isLate: status === "late",
          checkInTime: overrideFields.checkInTime,
          checkOutTime: overrideFields.checkOutTime,
          workedMinutes: overrideFields.workedMinutes,
          notes: setWorkModeOverrideNote(
            markManualAttendanceOverride(notes ?? existing[0]!.notes),
            currentWorkModeOverride,
          ),
        })
        .where(eq(attendanceTable.id, existing[0]!.id));
      const updatedRows = await db
        .select()
        .from(attendanceTable)
        .where(eq(attendanceTable.id, existing[0]!.id))
        .limit(1);
      record = updatedRows[0]!;
    } else {
      const overrideFields = resolveOverrideAttendanceFields(emp, date, status);
      const inserted = await db
        .insert(attendanceTable)
        .values({
          employeeId: Number(employeeId),
          date,
          status,
          isLate: status === "late",
          checkInTime: overrideFields.checkInTime,
          checkOutTime: overrideFields.checkOutTime,
          workedMinutes: overrideFields.workedMinutes,
          notes: markManualAttendanceOverride(notes ?? null),
        })
        .$returningId();
      const recordId = inserted[0]?.id;
      const insertedRows = recordId
        ? await db
            .select()
            .from(attendanceTable)
            .where(eq(attendanceTable.id, recordId))
            .limit(1)
        : [];
      record = insertedRows[0]!;
    }

    res.json(serializeRecord(record, emp.name, emp));
  },
);

router.post(
  "/attendance/work-mode",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const { employeeId, date, workMode } = req.body ?? {};
    if (!employeeId || !date || !workMode) {
      res
        .status(400)
        .json({ message: "employeeId, date and workMode required" });
      return;
    }

    if (!["onsite", "remote_work"].includes(workMode)) {
      res.status(400).json({ message: "Invalid work mode" });
      return;
    }

    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, Number(employeeId)))
      .limit(1);
    const emp = empRows[0];
    if (!emp) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    const defaultWorkMode = resolveDefaultWorkMode(emp);
    const persistedWorkMode = workMode === defaultWorkMode ? null : workMode;

    const existing = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, Number(employeeId)),
          eq(attendanceTable.date, date),
        ),
      )
      .limit(1);

    let record;
    if (existing.length) {
      const current = existing[0]!;
      let nextStatus = current.status;
      let nextIsLate = current.isLate;

      if (workMode === "onsite" && current.status === "remote_work") {
        const normalized = normalizeAttendanceStatus(current, emp);
        nextStatus = normalized.isLate ? "late" : "present";
        nextIsLate = normalized.isLate;
      }

      await db
        .update(attendanceTable)
        .set({
          status: nextStatus as typeof attendanceTable.$inferInsert.status,
          isLate: nextIsLate,
          notes: setWorkModeOverrideNote(current.notes, persistedWorkMode),
        })
        .where(eq(attendanceTable.id, current.id));

      const updatedRows = await db
        .select()
        .from(attendanceTable)
        .where(eq(attendanceTable.id, current.id))
        .limit(1);
      record = updatedRows[0]!;
    } else {
      const inserted = await db
        .insert(attendanceTable)
        .values({
          employeeId: Number(employeeId),
          date,
          status: "absent",
          isLate: false,
          checkInTime: null,
          checkOutTime: null,
          workedMinutes: 0,
          notes: setWorkModeOverrideNote(null, persistedWorkMode),
        })
        .$returningId();
      const recordId = inserted[0]?.id;
      const insertedRows = recordId
        ? await db
            .select()
            .from(attendanceTable)
            .where(eq(attendanceTable.id, recordId))
            .limit(1)
        : [];
      record = insertedRows[0]!;
    }

    res.json(serializeRecord(record, emp.name, emp));
  },
);

export default router;
