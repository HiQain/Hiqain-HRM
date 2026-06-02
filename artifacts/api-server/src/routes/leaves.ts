import { Router, type IRouter } from "express";
import { ApplyLeaveBody } from "@workspace/api-zod";
import {
  attendanceTable,
  db,
  employeesTable,
  leaveRequestsTable,
} from "@workspace/db";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { daysBetweenInclusive, parseDate, ymd } from "../lib/dates";
import {
  officeEndForShiftDate,
  officeMinutes,
  officeStartForShiftDate,
} from "../lib/attendance";
import { notifyEmployeeUser, notifyRoles } from "../lib/notifications";

function leaveDayTimes(
  emp: typeof employeesTable.$inferSelect,
  dateStr: string,
): { checkInTime: Date; checkOutTime: Date; workedMinutes: number } {
  const checkInTime = officeStartForShiftDate(emp, dateStr);
  const checkOutTime = officeEndForShiftDate(emp, dateStr);
  const workedMinutes = officeMinutes(emp);
  return { checkInTime, checkOutTime, workedMinutes };
}

const router: IRouter = Router();

function quotaFor(emp: typeof employeesTable.$inferSelect) {
  return {
    sick: emp.sickLeaveQuota,
    casual: emp.casualLeaveQuota,
    annual: emp.annualLeaveQuota,
  };
}

async function usedFor(employeeId: number, year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const rows = await db
    .select()
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.employeeId, employeeId),
        eq(leaveRequestsTable.status, "approved"),
        gte(leaveRequestsTable.startDate, start),
        lte(leaveRequestsTable.startDate, end),
      ),
    );
  let sickUsed = 0,
    casualUsed = 0,
    annualUsed = 0;
  for (const r of rows) {
    if (r.type === "sick") sickUsed += r.days;
    else if (r.type === "casual") casualUsed += r.days;
    else annualUsed += r.days;
  }
  return { sickUsed, casualUsed, annualUsed };
}

type AttachmentItem = { url: string; name: string };

function normalizeMentionedIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id));
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function mergedAttachments(r: {
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachments: AttachmentItem[] | null;
}): AttachmentItem[] {
  const list = Array.isArray(r.attachments) ? [...r.attachments] : [];
  if (
    r.attachmentUrl &&
    r.attachmentName &&
    !list.some((a) => a.url === r.attachmentUrl)
  ) {
    list.unshift({ url: r.attachmentUrl, name: r.attachmentName });
  }
  return list;
}

function normalizeAttachments(
  body: { attachments?: unknown },
): AttachmentItem[] | undefined {
  if (!Array.isArray(body.attachments)) return undefined;
  const out: AttachmentItem[] = [];
  for (const a of body.attachments) {
    if (
      a &&
      typeof a === "object" &&
      typeof (a as any).url === "string" &&
      typeof (a as any).name === "string"
    ) {
      out.push({ url: (a as any).url, name: (a as any).name });
    }
  }
  return out;
}

async function loadMentioned(ids: number[] | null | undefined) {
  const normalizedIds = normalizeMentionedIds(ids);
  if (normalizedIds.length === 0) return [];
  const rows = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(inArray(employeesTable.id, normalizedIds));
  return rows;
}

async function serialize(
  r: typeof leaveRequestsTable.$inferSelect,
  employeeName: string,
) {
  const mentionedEmployeeIds = normalizeMentionedIds(r.mentionedEmployeeIds);
  const mentions = await loadMentioned(mentionedEmployeeIds);
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    days: r.days,
    status: r.status,
    reason: r.reason,
    attachmentUrl: r.attachmentUrl,
    attachmentName: r.attachmentName,
    attachments: mergedAttachments(r),
    mentionedEmployeeIds,
    mentionedEmployees: mentions,
    appliedAt: toIsoString(r.appliedAt),
    reviewedAt: toIsoString(r.reviewedAt),
  };
}

router.get("/leaves", requireAuth(), async (req, res): Promise<void> => {
  const user = getUser(req);
  const status = req.query.status as string | undefined;
  const selfOnly = req.query.self === "1";
  const filters = [];
  if (user.role === "employee" || (user.role === "hr" && selfOnly)) {
    if (!user.employeeId) {
      res.json([]);
      return;
    }
    filters.push(eq(leaveRequestsTable.employeeId, user.employeeId));
  }
  if (status === "pending" || status === "approved" || status === "rejected") {
    filters.push(eq(leaveRequestsTable.status, status));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const rows = await db
    .select({
      r: leaveRequestsTable,
      name: employeesTable.name,
    })
    .from(leaveRequestsTable)
    .innerJoin(
      employeesTable,
      eq(employeesTable.id, leaveRequestsTable.employeeId),
    )
    .where(where ?? undefined)
    .orderBy(desc(leaveRequestsTable.appliedAt));

  const out = await Promise.all(
    rows.map(({ r, name }) => serialize(r, name)),
  );
  res.json(out);
});

router.post("/leaves", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.status(400).json({ message: "No employee profile" });
    return;
  }
  const parsed = ApplyLeaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }
  const start = parseDate(parsed.data.startDate as unknown as string);
  const end = parseDate(parsed.data.endDate as unknown as string);
  if (end < start) {
    res.status(400).json({ message: "End date must be after start date" });
    return;
  }
  const days = daysBetweenInclusive(start, end);
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;

  // Enforce per-employee quota (including pending leaves of same year)
  const year = start.getUTCFullYear();
  const used = await usedFor(user.employeeId, year);
  const pending = await db
    .select()
    .from(leaveRequestsTable)
    .where(
      and(
        eq(leaveRequestsTable.employeeId, user.employeeId),
        eq(leaveRequestsTable.status, "pending"),
        gte(leaveRequestsTable.startDate, `${year}-01-01`),
        lte(leaveRequestsTable.startDate, `${year}-12-31`),
      ),
    );
  let sickPending = 0,
    casualPending = 0,
    annualPending = 0;
  for (const p of pending) {
    if (p.type === "sick") sickPending += p.days;
    else if (p.type === "casual") casualPending += p.days;
    else annualPending += p.days;
  }
  const q = quotaFor(emp);
  const t = parsed.data.type;
  const usedTotal =
    t === "sick"
      ? used.sickUsed + sickPending
      : t === "casual"
        ? used.casualUsed + casualPending
        : used.annualUsed + annualPending;
  const quotaTotal =
    t === "sick" ? q.sick : t === "casual" ? q.casual : q.annual;
  if (usedTotal + days > quotaTotal) {
    res.status(400).json({
      message: `Insufficient ${t} leave balance. Available: ${Math.max(0, quotaTotal - usedTotal)} day(s), requested: ${days}.`,
    });
    return;
  }

  // Block if any day in the range already has a present/late attendance record
  const existingAttendance = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, user.employeeId),
        gte(attendanceTable.date, ymd(start)),
        lte(attendanceTable.date, ymd(end)),
      ),
    );
  const blocking = existingAttendance.find(
    (a) => a.status === "present" || a.status === "late",
  );
  if (blocking) {
    res.status(400).json({
      message: `You already have an attendance record marked as ${blocking.status} on ${blocking.date}. Cannot apply leave for that day.`,
    });
    return;
  }

  const attachmentsArr = normalizeAttachments(req.body ?? {}) ?? [];
  const firstAtt = attachmentsArr[0];
  const inserted = await db
    .insert(leaveRequestsTable)
    .values({
      employeeId: user.employeeId,
      type: parsed.data.type,
      startDate: ymd(start),
      endDate: ymd(end),
      days,
      reason: parsed.data.reason,
      attachmentUrl: parsed.data.attachmentUrl ?? firstAtt?.url ?? null,
      attachmentName: parsed.data.attachmentName ?? firstAtt?.name ?? null,
      attachments: attachmentsArr,
      mentionedEmployeeIds: parsed.data.mentionedEmployeeIds ?? [],
      status: "pending",
    })
    .$returningId();
  const requestId = inserted[0]?.id;
  if (!requestId) {
    res.status(500).json({ message: "Failed to create leave request" });
    return;
  }
  const insertedRows = await db
    .select()
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.id, requestId))
    .limit(1);
  const request = insertedRows[0];
  if (!request) {
    res.status(500).json({ message: "Created leave request could not be loaded" });
    return;
  }
  await notifyRoles(["admin", "hr"], {
    type: "leave_request",
    title: "New leave request",
    message: `${emp.name} submitted a ${request.type} leave request.`,
    href: "/admin/leaves",
  });
  await notifyEmployeeUser(user.employeeId, {
    type: "leave_request",
    title: "Leave request submitted",
    message: "Your leave request has been submitted for review.",
    href: "/employee/leaves",
  });
  res.status(201).json(await serialize(request, emp.name));
});

router.patch("/leaves/:id", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const existing = await db
    .select()
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.id, id))
    .limit(1);
  const row = existing[0];
  if (!row) {
    res.status(404).json({ message: "Leave not found" });
    return;
  }
  if (row.employeeId !== user.employeeId) {
    res.status(403).json({ message: "Not your request" });
    return;
  }
  if (row.status !== "pending") {
    res
      .status(400)
      .json({ message: "Only pending requests can be edited" });
    return;
  }

  const body = req.body ?? {};
  const newType = (body.type ?? row.type) as "sick" | "casual" | "annual";
  const newStart = body.startDate
    ? ymd(parseDate(body.startDate))
    : row.startDate;
  const newEnd = body.endDate ? ymd(parseDate(body.endDate)) : row.endDate;
  if (parseDate(newEnd) < parseDate(newStart)) {
    res
      .status(400)
      .json({ message: "End date must be after start date" });
    return;
  }
  const days = daysBetweenInclusive(parseDate(newStart), parseDate(newEnd));

  await db
    .update(leaveRequestsTable)
    .set({
      type: newType,
      startDate: newStart,
      endDate: newEnd,
      days,
      reason: typeof body.reason === "string" ? body.reason : row.reason,
      attachmentUrl:
        body.attachmentUrl === undefined
          ? row.attachmentUrl
          : body.attachmentUrl,
      attachmentName:
        body.attachmentName === undefined
          ? row.attachmentName
          : body.attachmentName,
      attachments:
        normalizeAttachments(body) ?? (row.attachments ?? []),
      mentionedEmployeeIds: Array.isArray(body.mentionedEmployeeIds)
        ? body.mentionedEmployeeIds
        : (row.mentionedEmployeeIds ?? []),
    })
    .where(eq(leaveRequestsTable.id, id));
  const updatedRows = await db
    .select()
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.id, id))
    .limit(1);
  const updated = updatedRows[0];
  if (!updated) {
    res.status(404).json({ message: "Leave not found" });
    return;
  }
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, updated.employeeId))
    .limit(1);
  res.json(await serialize(updated, empRows[0]?.name ?? ""));
});

router.delete("/leaves/:id", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const existing = await db
    .select()
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.id, id))
    .limit(1);
  const row = existing[0];
  if (!row) {
    res.status(404).json({ message: "Leave not found" });
    return;
  }
  if (row.employeeId !== user.employeeId) {
    res.status(403).json({ message: "Not your request" });
    return;
  }
  if (row.status !== "pending") {
    res
      .status(400)
      .json({ message: "Only pending requests can be cancelled" });
    return;
  }
  await db.delete(leaveRequestsTable).where(eq(leaveRequestsTable.id, id));
  res.json({ ok: true });
});

async function setStatus(id: number, status: "approved" | "rejected") {
  const result = await db
    .update(leaveRequestsTable)
    .set({ status, reviewedAt: new Date() })
    .where(eq(leaveRequestsTable.id, id));
  const affectedRows =
    typeof result === "object" &&
    result !== null &&
    "affectedRows" in result &&
    typeof result.affectedRows === "number"
      ? result.affectedRows
      : 0;
  if (affectedRows === 0) {
    return null;
  }
  const rows = await db
    .select()
    .from(leaveRequestsTable)
    .where(eq(leaveRequestsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

router.post("/leaves/:id/approve", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const updated = await setStatus(id, "approved");
  if (!updated) {
    res.status(404).json({ message: "Leave not found" });
    return;
  }

  // Auto-mark attendance for approved leave days, including office check-in/out times
  const start = parseDate(updated.startDate);
  const end = parseDate(updated.endDate);
  const empForLeave = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, updated.employeeId))
    .limit(1);
  const emp = empForLeave[0]!;
  const cur = new Date(start.getTime());
  while (cur <= end) {
    const dateStr = ymd(cur);
    const times = leaveDayTimes(emp, dateStr);
    const existing = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, updated.employeeId),
          eq(attendanceTable.date, dateStr),
        ),
      )
      .limit(1);
    if (existing.length) {
      await db
        .update(attendanceTable)
        .set({
          status: "on_leave",
          checkInTime: times.checkInTime,
          checkOutTime: times.checkOutTime,
          workedMinutes: times.workedMinutes,
          isLate: false,
        })
        .where(eq(attendanceTable.id, existing[0]!.id));
    } else {
      await db.insert(attendanceTable).values({
        employeeId: updated.employeeId,
        date: dateStr,
        status: "on_leave",
        checkInTime: times.checkInTime,
        checkOutTime: times.checkOutTime,
        workedMinutes: times.workedMinutes,
        isLate: false,
      });
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  await notifyEmployeeUser(updated.employeeId, {
    type: "leave_request",
    title: "Leave request approved",
    message: `Your ${updated.type} leave request was approved.`,
    href: "/employee/leaves",
  });
  res.json(await serialize(updated, emp.name));
});

router.post("/leaves/:id/reject", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const updated = await setStatus(id, "rejected");
  if (!updated) {
    res.status(404).json({ message: "Leave not found" });
    return;
  }
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, updated.employeeId))
    .limit(1);
  await notifyEmployeeUser(updated.employeeId, {
    type: "leave_request",
    title: "Leave request rejected",
    message: `Your ${updated.type} leave request was rejected.`,
    href: "/employee/leaves",
  });
  res.json(await serialize(updated, empRows[0]?.name ?? ""));
});

router.get("/leaves/balance", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.json({
      sick: 0,
      casual: 0,
      annual: 0,
      sickUsed: 0,
      casualUsed: 0,
      annualUsed: 0,
    });
    return;
  }
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;
  const q = quotaFor(emp);
  const year = new Date().getUTCFullYear();
  const used = await usedFor(user.employeeId, year);
  res.json({
    sick: q.sick,
    casual: q.casual,
    annual: q.annual,
    ...used,
  });
});

export default router;
