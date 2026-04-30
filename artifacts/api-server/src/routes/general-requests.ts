import { Router, type IRouter } from "express";
import {
  attendanceTable,
  db,
  employeesTable,
  generalRequestsTable,
  loansTable,
  salaryEventsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { getSettings } from "./settings";
import { computeLoanEligibility } from "./loans";

const router: IRouter = Router();

async function loadMentioned(ids: number[] | null | undefined) {
  if (!ids || ids.length === 0) return [];
  return db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(inArray(employeesTable.id, ids));
}

type AttachmentItem = { url: string; name: string };

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
      typeof (a as { url?: unknown }).url === "string" &&
      typeof (a as { name?: unknown }).name === "string"
    ) {
      out.push({
        url: (a as { url: string }).url,
        name: (a as { name: string }).name,
      });
    }
  }
  return out;
}

async function serialize(
  r: typeof generalRequestsTable.$inferSelect,
  employeeName: string,
) {
  const mentions = await loadMentioned(r.mentionedEmployeeIds ?? []);
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    type: r.type,
    date: r.date,
    dateTo: r.dateTo ?? null,
    amount: r.amount === null ? null : Number(r.amount),
    installmentMonths: r.installmentMonths ?? null,
    reason: r.reason,
    attachmentUrl: r.attachmentUrl,
    attachmentName: r.attachmentName,
    attachments: mergedAttachments(r),
    mentionedEmployeeIds: r.mentionedEmployeeIds ?? [],
    mentionedEmployees: mentions,
    status: r.status,
    appliedAt: r.appliedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}

router.get("/requests", requireAuth(), async (req, res) => {
  const user = getUser(req);
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const filters = [];
  if (user.role === "employee") {
    if (!user.employeeId) return res.json([]);
    filters.push(eq(generalRequestsTable.employeeId, user.employeeId));
  }
  const validTypes = [
    "half_day",
    "loan",
    "increment",
    "remote_work",
    "late",
    "resignation",
    "other",
  ] as const;
  if (type && (validTypes as readonly string[]).includes(type)) {
    filters.push(
      eq(generalRequestsTable.type, type as (typeof validTypes)[number]),
    );
  }
  if (status === "pending" || status === "approved" || status === "rejected") {
    filters.push(eq(generalRequestsTable.status, status));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const rows = await db
    .select({ r: generalRequestsTable, name: employeesTable.name })
    .from(generalRequestsTable)
    .innerJoin(
      employeesTable,
      eq(employeesTable.id, generalRequestsTable.employeeId),
    )
    .where(where ?? undefined)
    .orderBy(desc(generalRequestsTable.appliedAt));

  const out = await Promise.all(rows.map(({ r, name }) => serialize(r, name)));
  res.json(out);
});

function dateRange(start: string, end: string | null | undefined): string[] {
  if (!end || end <= start) return [start];
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = s; d.getTime() <= e.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

router.post("/requests", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId)
    return res.status(400).json({ message: "No employee profile" });
  const {
    type,
    date,
    dateTo,
    amount,
    installmentMonths,
    reason,
    attachmentUrl,
    attachmentName,
    mentionedEmployeeIds,
  } = req.body ?? {};
  const validRequestTypes = [
    "half_day",
    "loan",
    "increment",
    "remote_work",
    "late",
    "resignation",
    "other",
  ];
  if (
    !type ||
    !validRequestTypes.includes(type) ||
    !date ||
    !reason ||
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    return res
      .status(400)
      .json({ message: "type, date and reason are required" });
  }
  if (
    (type === "loan" || type === "increment") &&
    (amount == null || isNaN(Number(amount)) || Number(amount) <= 0)
  ) {
    return res
      .status(400)
      .json({ message: "Amount is required for loan and increment requests" });
  }

  if (type === "loan") {
    const eligibility = await computeLoanEligibility(user.employeeId);
    if (!eligibility.eligible) {
      return res.status(400).json({
        message: eligibility.reason ?? "Not eligible for a loan right now",
      });
    }
    if (Number(amount) > eligibility.maxAmount) {
      return res.status(400).json({
        message: `Loan amount cannot exceed ${eligibility.maxAmount}`,
      });
    }
    if (
      installmentMonths == null ||
      !Number.isInteger(Number(installmentMonths)) ||
      Number(installmentMonths) < 1
    ) {
      return res
        .status(400)
        .json({ message: "Installment months is required (must be >= 1)" });
    }
  }

  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;

  const attachmentsArr = normalizeAttachments(req.body ?? {}) ?? [];
  const firstAtt = attachmentsArr[0];
  const inserted = await db
    .insert(generalRequestsTable)
    .values({
      employeeId: user.employeeId,
      type,
      date,
      dateTo: dateTo ?? null,
      amount: amount != null ? String(amount) : null,
      installmentMonths:
        type === "loan" && installmentMonths != null
          ? Number(installmentMonths)
          : null,
      reason: reason.trim(),
      attachmentUrl: attachmentUrl ?? firstAtt?.url ?? null,
      attachmentName: attachmentName ?? firstAtt?.name ?? null,
      attachments: attachmentsArr,
      mentionedEmployeeIds: Array.isArray(mentionedEmployeeIds)
        ? mentionedEmployeeIds
        : [],
      status: "pending",
    })
    .returning();
  res.status(201).json(await serialize(inserted[0]!, emp.name));
});

router.patch("/requests/:id", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const existing = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.id, id))
    .limit(1);
  const row = existing[0];
  if (!row) return res.status(404).json({ message: "Request not found" });
  if (row.employeeId !== user.employeeId)
    return res.status(403).json({ message: "Not your request" });
  if (row.status !== "pending")
    return res
      .status(400)
      .json({ message: "Only pending requests can be edited" });

  const body = req.body ?? {};
  const updated = await db
    .update(generalRequestsTable)
    .set({
      type: body.type ?? row.type,
      date: body.date ?? row.date,
      dateTo: body.dateTo !== undefined ? (body.dateTo ?? null) : row.dateTo,
      amount:
        body.amount === undefined
          ? row.amount
          : body.amount != null
            ? String(body.amount)
            : null,
      installmentMonths:
        body.installmentMonths === undefined
          ? row.installmentMonths
          : body.installmentMonths != null
            ? Number(body.installmentMonths)
            : null,
      reason: typeof body.reason === "string" ? body.reason : row.reason,
      attachmentUrl:
        body.attachmentUrl === undefined
          ? row.attachmentUrl
          : body.attachmentUrl,
      attachmentName:
        body.attachmentName === undefined
          ? row.attachmentName
          : body.attachmentName,
      attachments: normalizeAttachments(body) ?? row.attachments ?? [],
      mentionedEmployeeIds: Array.isArray(body.mentionedEmployeeIds)
        ? body.mentionedEmployeeIds
        : (row.mentionedEmployeeIds ?? []),
    })
    .where(eq(generalRequestsTable.id, id))
    .returning();
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, updated[0]!.employeeId))
    .limit(1);
  res.json(await serialize(updated[0]!, empRows[0]?.name ?? ""));
});

router.delete("/requests/:id", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const existing = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.id, id))
    .limit(1);
  const row = existing[0];
  if (!row) return res.status(404).json({ message: "Request not found" });
  if (row.employeeId !== user.employeeId)
    return res.status(403).json({ message: "Not your request" });
  if (row.status !== "pending")
    return res
      .status(400)
      .json({ message: "Only pending requests can be cancelled" });
  await db.delete(generalRequestsTable).where(eq(generalRequestsTable.id, id));
  res.json({ ok: true });
});

router.post(
  "/requests/:id/approve",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const existingRow = await db
      .select()
      .from(generalRequestsTable)
      .where(eq(generalRequestsTable.id, id))
      .limit(1);
    if (!existingRow.length)
      return res.status(404).json({ message: "Request not found" });
    const existing = existingRow[0]!;

    // For loan, allow override of installment months from body
    let approvedMonths: number | null = existing.installmentMonths;
    if (existing.type === "loan") {
      const body = req.body ?? {};
      if (body.installmentMonths != null) {
        const m = Number(body.installmentMonths);
        if (!Number.isInteger(m) || m < 1) {
          return res
            .status(400)
            .json({ message: "installmentMonths must be a positive integer" });
        }
        approvedMonths = m;
      }
      if (approvedMonths == null) {
        const settings = await getSettings();
        approvedMonths = settings.loanDefaultMonths;
      }
    }

    const updated = await db
      .update(generalRequestsTable)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        installmentMonths: approvedMonths ?? existing.installmentMonths,
      })
      .where(eq(generalRequestsTable.id, id))
      .returning();
    const row = updated[0]!;

    // Side effects
    if (
      row.type === "half_day" ||
      row.type === "remote_work" ||
      row.type === "late"
    ) {
      // Approved late/half-day/remote-work: mark the relevant attendance
      // rows excused so payroll does NOT deduct anything for them.
      const newStatus =
        row.type === "half_day"
          ? "half_day"
          : row.type === "remote_work"
            ? "remote_work"
            : null; // late: keep whatever status is already on the row
      const dates = dateRange(row.date, row.dateTo);
      for (const d of dates) {
        const existingAtt = await db
          .select()
          .from(attendanceTable)
          .where(
            and(
              eq(attendanceTable.employeeId, row.employeeId),
              eq(attendanceTable.date, d),
            ),
          )
          .limit(1);
        if (existingAtt.length) {
          const setVals: Partial<typeof attendanceTable.$inferInsert> = {
            excused: true,
          };
          if (newStatus) setVals.status = newStatus;
          await db
            .update(attendanceTable)
            .set(setVals)
            .where(eq(attendanceTable.id, existingAtt[0]!.id));
        } else {
          await db.insert(attendanceTable).values({
            employeeId: row.employeeId,
            date: d,
            status: newStatus ?? "late",
            excused: true,
          });
        }
      }
    } else if (row.type === "loan") {
      // Create a loans row that the payroll engine will draw from.
      const principal = Number(row.amount ?? 0);
      const months = Math.max(1, approvedMonths ?? 1);
      const startDate = new Date(row.date + "T00:00:00Z");
      // Loan repayments begin on the next month after the request date
      const nextMonth = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1),
      );
      await db.insert(loansTable).values({
        employeeId: row.employeeId,
        requestId: row.id,
        principalAmount: String(principal),
        monthsToRepay: months,
        startMonth: nextMonth.getUTCMonth() + 1,
        startYear: nextMonth.getUTCFullYear(),
        status: "active",
        notes: row.reason,
      });
    } else if (row.type === "increment") {
      await db.insert(salaryEventsTable).values({
        employeeId: row.employeeId,
        type: row.type,
        amount: row.amount ?? "0",
        date: row.date,
        reason: row.reason,
      });
    }
    // For 'late' and 'resignation' / 'other' we just record the acknowledgement.

    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, row.employeeId))
      .limit(1);
    res.json(await serialize(row, empRows[0]?.name ?? ""));
  },
);

router.post(
  "/requests/:id/reject",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const updated = await db
      .update(generalRequestsTable)
      .set({ status: "rejected", reviewedAt: new Date() })
      .where(eq(generalRequestsTable.id, id))
      .returning();
    const row = updated[0];
    if (!row) return res.status(404).json({ message: "Request not found" });
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, row.employeeId))
      .limit(1);
    res.json(await serialize(row, empRows[0]?.name ?? ""));
  },
);

export default router;
