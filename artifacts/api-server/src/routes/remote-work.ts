import { Router, type IRouter } from "express";
import {
  attendanceTable,
  db,
  employeesTable,
  remoteWorkRequestsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";

const router: IRouter = Router();

async function loadMentioned(ids: number[] | null | undefined) {
  if (!ids || ids.length === 0) return [];
  const rows = await db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(inArray(employeesTable.id, ids));
  return rows;
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
      typeof (a as any).url === "string" &&
      typeof (a as any).name === "string"
    ) {
      out.push({ url: (a as any).url, name: (a as any).name });
    }
  }
  return out;
}

async function serialize(
  r: typeof remoteWorkRequestsTable.$inferSelect,
  employeeName: string,
) {
  const mentions = await loadMentioned(r.mentionedEmployeeIds ?? []);
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    date: r.date,
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

router.get("/remote-work", requireAuth(), async (req, res) => {
  const user = getUser(req);
  const status = req.query.status as string | undefined;
  const filters = [];
  if (user.role === "employee") {
    if (!user.employeeId) return res.json([]);
    filters.push(eq(remoteWorkRequestsTable.employeeId, user.employeeId));
  }
  if (status === "pending" || status === "approved" || status === "rejected") {
    filters.push(eq(remoteWorkRequestsTable.status, status));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const rows = await db
    .select({
      r: remoteWorkRequestsTable,
      name: employeesTable.name,
    })
    .from(remoteWorkRequestsTable)
    .innerJoin(
      employeesTable,
      eq(employeesTable.id, remoteWorkRequestsTable.employeeId),
    )
    .where(where ?? undefined)
    .orderBy(desc(remoteWorkRequestsTable.appliedAt));

  const out = await Promise.all(
    rows.map(({ r, name }) => serialize(r, name)),
  );
  res.json(out);
});

router.post("/remote-work", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId)
    return res.status(400).json({ message: "No employee profile" });
  const {
    date,
    reason,
    attachmentUrl,
    attachmentName,
    mentionedEmployeeIds,
  } = req.body ?? {};
  if (!date || !reason || typeof reason !== "string" || !reason.trim()) {
    return res.status(400).json({ message: "date and reason are required" });
  }

  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;

  const existing = await db
    .select()
    .from(remoteWorkRequestsTable)
    .where(
      and(
        eq(remoteWorkRequestsTable.employeeId, user.employeeId),
        eq(remoteWorkRequestsTable.date, date),
      ),
    );
  if (existing.some((r) => r.status !== "rejected")) {
    return res
      .status(400)
      .json({ message: "A remote work request for this date already exists" });
  }

  const attachmentsArr = normalizeAttachments(req.body ?? {}) ?? [];
  const firstAtt = attachmentsArr[0];
  const inserted = await db
    .insert(remoteWorkRequestsTable)
    .values({
      employeeId: user.employeeId,
      date,
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

router.patch(
  "/remote-work/:id",
  requireAuth(["employee"]),
  async (req, res) => {
    const user = getUser(req);
    const id = Number(req.params.id);
    const existing = await db
      .select()
      .from(remoteWorkRequestsTable)
      .where(eq(remoteWorkRequestsTable.id, id))
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
      .update(remoteWorkRequestsTable)
      .set({
        date: body.date ?? row.date,
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
      .where(eq(remoteWorkRequestsTable.id, id))
      .returning();
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, updated[0]!.employeeId))
      .limit(1);
    res.json(await serialize(updated[0]!, empRows[0]?.name ?? ""));
  },
);

router.delete(
  "/remote-work/:id",
  requireAuth(["employee"]),
  async (req, res) => {
    const user = getUser(req);
    const id = Number(req.params.id);
    const existing = await db
      .select()
      .from(remoteWorkRequestsTable)
      .where(eq(remoteWorkRequestsTable.id, id))
      .limit(1);
    const row = existing[0];
    if (!row) return res.status(404).json({ message: "Request not found" });
    if (row.employeeId !== user.employeeId)
      return res.status(403).json({ message: "Not your request" });
    if (row.status !== "pending")
      return res
        .status(400)
        .json({ message: "Only pending requests can be cancelled" });
    await db
      .delete(remoteWorkRequestsTable)
      .where(eq(remoteWorkRequestsTable.id, id));
    res.json({ ok: true });
  },
);

router.post(
  "/remote-work/:id/approve",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const updated = await db
      .update(remoteWorkRequestsTable)
      .set({ status: "approved", reviewedAt: new Date() })
      .where(eq(remoteWorkRequestsTable.id, id))
      .returning();
    const row = updated[0];
    if (!row) return res.status(404).json({ message: "Request not found" });

    const existing = await db
      .select()
      .from(attendanceTable)
      .where(
        and(
          eq(attendanceTable.employeeId, row.employeeId),
          eq(attendanceTable.date, row.date),
        ),
      )
      .limit(1);
    if (existing.length) {
      await db
        .update(attendanceTable)
        .set({ status: "remote_work", isLate: false })
        .where(eq(attendanceTable.id, existing[0]!.id));
    } else {
      await db.insert(attendanceTable).values({
        employeeId: row.employeeId,
        date: row.date,
        status: "remote_work",
        isLate: false,
      });
    }

    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, row.employeeId))
      .limit(1);
    res.json(await serialize(row, empRows[0]?.name ?? ""));
  },
);

router.post(
  "/remote-work/:id/reject",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const updated = await db
      .update(remoteWorkRequestsTable)
      .set({ status: "rejected", reviewedAt: new Date() })
      .where(eq(remoteWorkRequestsTable.id, id))
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
