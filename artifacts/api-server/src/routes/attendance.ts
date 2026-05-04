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
import { parseHHMM, ymd } from "../lib/dates";
import { isPayrollOffDay, toHolidaySet } from "../lib/payroll";
import { getSettings } from "./settings";

const router: IRouter = Router();

function serializeRecord(
  r: typeof attendanceTable.$inferSelect,
  employeeName: string,
) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    date: r.date,
    checkInTime: r.checkInTime ? r.checkInTime.toISOString() : null,
    checkOutTime: r.checkOutTime ? r.checkOutTime.toISOString() : null,
    workedMinutes: r.workedMinutes,
    status: r.status,
    isLate: r.isLate,
    excused: r.excused,
    notes: r.notes,
  };
}

function officeMinutes(emp: typeof employeesTable.$inferSelect): number {
  const s = parseHHMM(emp.officeStartTime);
  const e = parseHHMM(emp.officeEndTime);
  return e.h * 60 + e.m - (s.h * 60 + s.m);
}

router.post(
  "/attendance/check-in",
  requireAuth(["employee"]),
  async (req, res) => {
    const user = getUser(req);
    if (!user.employeeId)
      return res.status(400).json({ message: "No employee profile" });
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const today = ymd(new Date());
    const now = new Date();

    const existing = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          eq(attendanceTable.date, today),
        ),
      )
      .limit(1);

    if (existing.length && existing[0]!.checkInTime) {
      return res.status(400).json({ message: "Already checked in today" });
    }

    // Block check-in if on approved leave today
    const leaveOnDay = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.employeeId, user.employeeId),
          eq(leaveRequestsTable.status, "approved"),
          lte(leaveRequestsTable.startDate, today),
          gte(leaveRequestsTable.endDate, today),
        ),
      )
      .limit(1);
    if (leaveOnDay.length) {
      return res.status(400).json({
        message: "You are on approved leave today and cannot check in.",
      });
    }

    // Determine if today is an approved remote work day
    const remoteApproved = await db
      .select()
      .from(remoteWorkRequestsTable)
      .where(
        and(
          eq(remoteWorkRequestsTable.employeeId, user.employeeId),
          eq(remoteWorkRequestsTable.date, today),
          eq(remoteWorkRequestsTable.status, "approved"),
        ),
      )
      .limit(1);

    const isRemoteToday =
      emp.positionType === "remote" || remoteApproved.length > 0;

    const { h, m } = parseHHMM(emp.officeStartTime);
    const officeStart = new Date(now);
    officeStart.setUTCHours(h, m, 0, 0);
    const graceCutoff = new Date(
      officeStart.getTime() + emp.gracePeriodMinutes * 60_000,
    );
    const isLate = !isRemoteToday && now > graceCutoff;

    const status: "present" | "late" | "remote_work" = isRemoteToday
      ? "remote_work"
      : isLate
        ? "late"
        : "present";

    let record;
    if (existing.length) {
      const updated = await db
        .update(attendanceTable)
        .set({
          checkInTime: now,
          isLate,
          status,
        })
        .where(eq(attendanceTable.id, existing[0]!.id))
        .returning();
      record = updated[0]!;
    } else {
      const inserted = await db
        .insert(attendanceTable)
        .values({
          employeeId: user.employeeId,
          date: today,
          checkInTime: now,
          isLate,
          status,
        })
        .returning();
      record = inserted[0]!;
    }
    res.json(serializeRecord(record, emp.name));
  },
);

router.post(
  "/attendance/check-out",
  requireAuth(["employee"]),
  async (req, res) => {
    const user = getUser(req);
    if (!user.employeeId)
      return res.status(400).json({ message: "No employee profile" });
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const today = ymd(new Date());
    const now = new Date();

    const settings = await getSettings();
    const holidaySet = toHolidaySet(settings);
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          eq(attendanceTable.date, today),
        ),
      )
      .limit(1);

    if (!rows.length || !rows[0]!.checkInTime) {
      return res.status(400).json({ message: "You haven't checked in today" });
    }
    const rec = rows[0]!;
    const worked = Math.floor(
      (now.getTime() - rec.checkInTime!.getTime()) / 60000,
    );

    // Auto half-day if worked < 50% of office hours (only when not remote/leave)
    const fullDayMinutes = officeMinutes(emp);
    let nextStatus = rec.status;
    let nextIsLate = rec.isLate;
    if (
      rec.status !== "remote_work" &&
      rec.status !== "on_leave" &&
      fullDayMinutes > 0 &&
      worked < fullDayMinutes / 2
    ) {
      nextStatus = "half_day";
    } else if (
      rec.status === "late" &&
      fullDayMinutes > 0 &&
      worked >= fullDayMinutes
    ) {
      // Late check-in but full hours worked → count as Present
      nextStatus = "present";
      nextIsLate = false;
    }

    const updated = await db
      .update(attendanceTable)
      .set({
        checkOutTime: now,
        workedMinutes: worked,
        status: nextStatus,
        isLate: nextIsLate,
      })
      .where(eq(attendanceTable.id, rec.id))
      .returning();

    res.json(serializeRecord(updated[0]!, emp.name));
  },
);

router.get(
  "/attendance/today",
  requireAuth(["employee"]),
  async (req, res) => {
    const user = getUser(req);
    if (!user.employeeId)
      return res.json({
        hasCheckedIn: false,
        hasCheckedOut: false,
        record: null,
      });
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const emp = empRows[0]!;
    const today = ymd(new Date());
    const rows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          eq(attendanceTable.date, today),
        ),
      )
      .limit(1);
    if (!rows.length) {
      return res.json({
        hasCheckedIn: false,
        hasCheckedOut: false,
        record: null,
      });
    }
    const r = rows[0]!;
    res.json({
      hasCheckedIn: !!r.checkInTime,
      hasCheckedOut: !!r.checkOutTime,
      record: serializeRecord(r, emp.name),
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

router.get("/attendance/me", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId) return res.json([]);
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
  res.json(rows.map((r) => serializeRecord(r, emp.name)));
});

router.get(
  "/attendance/employee/:id",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id))
      .limit(1);
    if (!empRows.length)
      return res.status(404).json({ message: "Employee not found" });
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
    res.json(rows.map((r) => serializeRecord(r, emp.name)));
  },
);

router.get(
  "/attendance/today-summary",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const dateParam = typeof req.query.date === "string" ? req.query.date : "";
    const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
    const targetDate = isValidDate ? dateParam : ymd(new Date());
    const today = ymd(new Date());
    const allEmps = await db.select().from(employeesTable);

    const records = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.date, targetDate));
    const recMap = new Map(records.map((r) => [r.employeeId, r]));

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
      const r = recMap.get(emp.id);
      if (r) {
        if (r.status === "present") present += 1;
        else if (r.status === "late") late += 1;
        else if (r.status === "on_leave") onLeave += 1;
        else if (r.status === "half_day") halfDay += 1;
        else if (r.status === "remote_work") remoteWork += 1;
        else absent += 1;
        out.push(serializeRecord(r, emp.name));
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
          status: "absent",
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
          status: "on_leave",
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
          status: "absent",
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
  async (req, res) => {
    const user = getUser(req);
    const queryEmpId = req.query.employeeId
      ? Number(req.query.employeeId)
      : user.employeeId;
    if (!queryEmpId)
      return res.status(400).json({ message: "employeeId required" });
    if (user.role === "employee" && user.employeeId !== queryEmpId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, queryEmpId))
      .limit(1);
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ message: "Employee not found" });

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

    const todayStr = ymd(new Date());
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
      if (r) {
        status = r.status;
      } else if (leaveDates.has(dateStr)) {
        status = "on_leave";
      } else if (dow === 0 || dow === 6) {
        status = "weekend";
      } else if (dateStr > todayStr) {
        status = "future";
      } else if (dateStr < emp.joiningDate) {
        status = "none";
      } else {
        status = "absent";
      }
      days.push({
        date: dateStr,
        status,
        record: r ? serializeRecord(r, emp.name) : null,
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
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid employee id" });
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, id))
      .limit(1);
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ message: "Employee not found" });

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
      .filter((r) => r.isLate || r.status === "late")
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((r) => serializeRecord(r, emp.name));
    res.json(lates);
  },
);

// Admin/HR can excuse (or un-excuse) a single attendance row.
// An excused late row is forgiven by payroll: it doesn't count toward the
// late→absence penalty.
router.post(
  "/attendance/:id/excuse",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid attendance id" });
    }
    const excused = req.body?.excused;
    if (typeof excused !== "boolean") {
      return res
        .status(400)
        .json({ message: "Body must contain { excused: boolean }" });
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
    if (!rows.length)
      return res.status(404).json({ message: "Attendance record not found" });
    const updated = await db
      .update(attendanceTable)
      .set({ excused })
      .where(eq(attendanceTable.id, id))
      .returning();
    res.json(serializeRecord(updated[0]!, rows[0]!.employeeName));
  },
);

// Admin override: create or update a record for any employee/date
router.post(
  "/attendance/override",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const { employeeId, date, status, notes } = req.body ?? {};
    if (!employeeId || !date || !status)
      return res
        .status(400)
        .json({ message: "employeeId, date and status required" });
    const allowed = [
      "present",
      "late",
      "absent",
      "on_leave",
      "half_day",
      "remote_work",
    ];
    if (!allowed.includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, Number(employeeId)))
      .limit(1);
    const emp = empRows[0];
    if (!emp) return res.status(404).json({ message: "Employee not found" });

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
      const updated = await db
        .update(attendanceTable)
        .set({
          status,
          isLate: status === "late",
          notes: notes ?? existing[0]!.notes,
        })
        .where(eq(attendanceTable.id, existing[0]!.id))
        .returning();
      record = updated[0]!;
    } else {
      const inserted = await db
        .insert(attendanceTable)
        .values({
          employeeId: Number(employeeId),
          date,
          status,
          isLate: status === "late",
          notes: notes ?? null,
        })
        .returning();
      record = inserted[0]!;
    }

    res.json(serializeRecord(record, emp.name));
  },
);

export default router;
