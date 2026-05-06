import { Router, type IRouter } from "express";
import {
  attendanceTable,
  db,
  employeesTable,
  generalRequestsTable,
  leaveRequestsTable,
  salaryEventsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { parseDate, ymd } from "../lib/dates";
import { resolveAttendanceShiftDate } from "../lib/attendance";

const router: IRouter = Router();

router.get(
  "/dashboard/admin",
  requireAuth(["admin", "hr"]),
  async (_req, res) => {
    const allEmps = await db.select().from(employeesTable);
    const today = ymd(new Date());

    const attRecords = await db
      .select()
      .from(attendanceTable)
      .where(eq(attendanceTable.date, today));
    const attMap = new Map(attRecords.map((r) => [r.employeeId, r]));
    let present = 0;
    let late = 0;
    let absent = 0;
    let onLeave = 0;
    let halfDay = 0;
    let remoteWork = 0;
    for (const e of allEmps) {
      const r = attMap.get(e.id);
      if (!r) absent += 1;
      else if (r.status === "present") present += 1;
      else if (r.status === "late") late += 1;
      else if (r.status === "on_leave") onLeave += 1;
      else if (r.status === "half_day") halfDay += 1;
      else if (r.status === "remote_work") remoteWork += 1;
      else absent += 1;
    }

    const pendingLeaves = await db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.status, "pending"));

    const pendingOther = await db
      .select()
      .from(generalRequestsTable)
      .where(eq(generalRequestsTable.status, "pending"));

    // Upcoming birthdays/anniversaries (next 30 days)
    const now = new Date();
    const inXDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const year = now.getUTCFullYear();
    const upcomingBirthdays: Array<{
      employeeId: number;
      employeeName: string;
      date: string;
      avatarUrl: string | null;
    }> = [];
    const upcomingAnniversaries: Array<{
      employeeId: number;
      employeeName: string;
      date: string;
      avatarUrl: string | null;
    }> = [];
    for (const e of allEmps) {
      if (e.dateOfBirth) {
        const dob = parseDate(e.dateOfBirth);
        let bday = new Date(
          Date.UTC(year, dob.getUTCMonth(), dob.getUTCDate()),
        );
        if (bday < now)
          bday = new Date(
            Date.UTC(year + 1, dob.getUTCMonth(), dob.getUTCDate()),
          );
        if (bday <= inXDays) {
          upcomingBirthdays.push({
            employeeId: e.id,
            employeeName: e.name,
            date: ymd(bday),
            avatarUrl: e.avatarUrl,
          });
        }
      }
      const join = parseDate(e.joiningDate);
      let ann = new Date(
        Date.UTC(year, join.getUTCMonth(), join.getUTCDate()),
      );
      if (ann < now)
        ann = new Date(
          Date.UTC(year + 1, join.getUTCMonth(), join.getUTCDate()),
        );
      if (ann <= inXDays && ann.getUTCFullYear() > join.getUTCFullYear()) {
        upcomingAnniversaries.push({
          employeeId: e.id,
          employeeName: e.name,
          date: ymd(ann),
          avatarUrl: e.avatarUrl,
        });
      }
    }
    upcomingBirthdays.sort((a, b) => (a.date < b.date ? -1 : 1));
    upcomingAnniversaries.sort((a, b) => (a.date < b.date ? -1 : 1));

    const recentSalary = await db
      .select()
      .from(salaryEventsTable)
      .orderBy(desc(salaryEventsTable.date))
      .limit(8);

    res.json({
      totalEmployees: allEmps.length,
      presentToday: present,
      lateToday: late,
      absentToday: absent,
      onLeaveToday: onLeave,
      halfDayToday: halfDay,
      remoteWorkToday: remoteWork,
      pendingLeaveRequests: pendingLeaves.length,
      pendingOtherRequests: pendingOther.length,
      upcomingBirthdays: upcomingBirthdays.slice(0, 6),
      upcomingAnniversaries: upcomingAnniversaries.slice(0, 6),
      recentSalaryEvents: recentSalary.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        type: e.type,
        amount: Number(e.amount),
        date: e.date,
        reason: e.reason,
      })),
    });
  },
);

router.get(
  "/dashboard/employee",
  requireAuth(["employee"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }

    const empRows = await db
      .select({ employee: employeesTable, email: usersTable.email })
      .from(employeesTable)
      .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
      .where(eq(employeesTable.id, user.employeeId))
      .limit(1);
    const e = empRows[0]!.employee;
    const email = empRows[0]!.email;
    const join = parseDate(e.joiningDate);

    const employee = {
      id: e.id,
      userId: e.userId,
      name: e.name,
      email,
      phone: e.phone,
      position: e.position,
      department: e.department,
      positionType: e.positionType,
      joiningDate: e.joiningDate,
      probationMonths: e.probationMonths,
      probationEndDate: ymd(
        new Date(
          Date.UTC(
            join.getUTCFullYear(),
            join.getUTCMonth() + e.probationMonths,
            join.getUTCDate(),
          ),
        ),
      ),
      officeStartTime: e.officeStartTime,
      officeEndTime: e.officeEndTime,
      gracePeriodMinutes: e.gracePeriodMinutes,
      basicSalary: Number(e.basicSalary),
      allowances: Number(e.allowances),
      casualLeaveQuota: e.casualLeaveQuota,
      sickLeaveQuota: e.sickLeaveQuota,
      annualLeaveQuota: e.annualLeaveQuota,
      dateOfBirth: e.dateOfBirth,
      education: e.education,
      address: e.address,
      avatarUrl: e.avatarUrl,
    };

    const now = new Date();
    const today = resolveAttendanceShiftDate(e, now);
    const todayRows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          eq(attendanceTable.date, today),
        ),
      )
      .limit(1);
    const todayRec = todayRows[0];
    const todayAttendance = {
      hasCheckedIn: !!todayRec?.checkInTime,
      hasCheckedOut: !!todayRec?.checkOutTime,
      record: todayRec
        ? {
            id: todayRec.id,
            employeeId: todayRec.employeeId,
            employeeName: e.name,
            date: todayRec.date,
            checkInTime: todayRec.checkInTime
              ? todayRec.checkInTime.toISOString()
              : null,
            checkOutTime: todayRec.checkOutTime
              ? todayRec.checkOutTime.toISOString()
              : null,
            workedMinutes: todayRec.workedMinutes,
            status: todayRec.status,
            isLate: todayRec.isLate,
            notes: todayRec.notes,
          }
        : null,
    };

    // Month stats
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = ymd(new Date(Date.UTC(y, m, 0)));
    const monthRows = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, user.employeeId),
          gte(attendanceTable.date, start),
          lte(attendanceTable.date, end),
        ),
      );
    let mPresent = 0,
      mLate = 0,
      mAbsent = 0,
      mLeave = 0,
      mHalf = 0,
      mRemote = 0;
    for (const r of monthRows) {
      if (r.status === "present") mPresent += 1;
      else if (r.status === "late") mLate += 1;
      else if (r.status === "on_leave") mLeave += 1;
      else if (r.status === "half_day") mHalf += 1;
      else if (r.status === "remote_work") mRemote += 1;
      else mAbsent += 1;
    }

    // Leave balance
    const yearStart = `${y}-01-01`;
    const yearEnd = `${y}-12-31`;
    const leaves = await db
      .select()
      .from(leaveRequestsTable)
      .where(
        and(
          eq(leaveRequestsTable.employeeId, user.employeeId),
          eq(leaveRequestsTable.status, "approved"),
          gte(leaveRequestsTable.startDate, yearStart),
          lte(leaveRequestsTable.startDate, yearEnd),
        ),
      );
    let sickU = 0,
      casualU = 0,
      annualU = 0;
    for (const l of leaves) {
      if (l.type === "sick") sickU += l.days;
      else if (l.type === "casual") casualU += l.days;
      else annualU += l.days;
    }
    const leaveBalance = {
      sick: e.sickLeaveQuota,
      casual: e.casualLeaveQuota,
      annual: e.annualLeaveQuota,
      sickUsed: sickU,
      casualUsed: casualU,
      annualUsed: annualU,
    };

    const recentLeavesRows = await db
      .select()
      .from(leaveRequestsTable)
      .where(eq(leaveRequestsTable.employeeId, user.employeeId))
      .orderBy(desc(leaveRequestsTable.appliedAt))
      .limit(5);

    const recentLeaves = recentLeavesRows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: e.name,
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
      status: r.status,
      reason: r.reason,
      appliedAt: r.appliedAt.toISOString(),
    }));

    res.json({
      employee,
      todayAttendance,
      leaveBalance,
      monthAttendance: {
        present: mPresent + mLate,
        late: mLate,
        absent: mAbsent,
        onLeave: mLeave,
        halfDay: mHalf,
        remoteWork: mRemote,
      },
      recentLeaves,
    });
  },
);

router.get("/feed", requireAuth(), async (_req, res) => {
  const allEmps = await db.select().from(employeesTable);
  const now = new Date();
  const todayStr = ymd(now);
  const inXDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  type Item = {
    employeeId: number;
    employeeName: string;
    date: string;
    avatarUrl: string | null;
    yearsCount?: number;
    age?: number;
  };
  const todayBirthdays: Item[] = [];
  const todayAnniversaries: Item[] = [];
  const upcomingBirthdays: Item[] = [];
  const upcomingAnniversaries: Item[] = [];

  for (const e of allEmps) {
    if (e.dateOfBirth) {
      const dob = parseDate(e.dateOfBirth);
      let bday = new Date(
        Date.UTC(year, dob.getUTCMonth(), dob.getUTCDate()),
      );
      if (
        bday.getUTCMonth() === now.getUTCMonth() &&
        bday.getUTCDate() === now.getUTCDate()
      ) {
        const age = year - dob.getUTCFullYear();
        todayBirthdays.push({
          employeeId: e.id,
          employeeName: e.name,
          date: ymd(bday),
          avatarUrl: e.avatarUrl,
          age,
        });
      } else {
        if (bday < now)
          bday = new Date(
            Date.UTC(year + 1, dob.getUTCMonth(), dob.getUTCDate()),
          );
        if (bday <= inXDays) {
          upcomingBirthdays.push({
            employeeId: e.id,
            employeeName: e.name,
            date: ymd(bday),
            avatarUrl: e.avatarUrl,
            age: bday.getUTCFullYear() - dob.getUTCFullYear(),
          });
        }
      }
    }
    const join = parseDate(e.joiningDate);
    let ann = new Date(Date.UTC(year, join.getUTCMonth(), join.getUTCDate()));
    if (
      ann.getUTCMonth() === now.getUTCMonth() &&
      ann.getUTCDate() === now.getUTCDate() &&
      year > join.getUTCFullYear()
    ) {
      todayAnniversaries.push({
        employeeId: e.id,
        employeeName: e.name,
        date: ymd(ann),
        avatarUrl: e.avatarUrl,
        yearsCount: year - join.getUTCFullYear(),
      });
    } else {
      if (ann < now)
        ann = new Date(
          Date.UTC(year + 1, join.getUTCMonth(), join.getUTCDate()),
        );
      if (ann <= inXDays && ann.getUTCFullYear() > join.getUTCFullYear()) {
        upcomingAnniversaries.push({
          employeeId: e.id,
          employeeName: e.name,
          date: ymd(ann),
          avatarUrl: e.avatarUrl,
          yearsCount: ann.getUTCFullYear() - join.getUTCFullYear(),
        });
      }
    }
  }
  upcomingBirthdays.sort((a, b) => (a.date < b.date ? -1 : 1));
  upcomingAnniversaries.sort((a, b) => (a.date < b.date ? -1 : 1));

  res.json({
    today: todayStr,
    todayBirthdays,
    todayAnniversaries,
    upcomingBirthdays,
    upcomingAnniversaries,
  });
});

export default router;
