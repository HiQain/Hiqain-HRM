import { Router, type IRouter } from "express";
import { db, notificationsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";

const router: IRouter = Router();

function serializeNotification(row: typeof notificationsTable.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    href: row.href,
    isRead: Boolean(row.isRead),
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/notifications", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  const unreadOnly = req.query.unread === "1";
  const filters = [eq(notificationsTable.userId, actor.id)];
  if (unreadOnly) {
    filters.push(eq(notificationsTable.isRead, false));
  }

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(...filters))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(100);

  res.json(rows.map(serializeNotification));
});

router.post("/notifications/:id/read", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, actor.id)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Notification not found" });
    return;
  }

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, id));

  res.json({ success: true });
});

router.post("/notifications/read-all", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, actor.id), eq(notificationsTable.isRead, false)));
  res.json({ success: true });
});

export default router;
