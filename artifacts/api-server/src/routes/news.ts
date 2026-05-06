import { Router, type IRouter } from "express";
import { CreateNewsPostBody } from "@workspace/api-zod";
import { db, newsPostsTable, usersTable, employeesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

function serialize(
  p: typeof newsPostsTable.$inferSelect,
  authorName: string,
) {
  return {
    id: p.id,
    authorId: p.authorId,
    authorName,
    title: p.title,
    body: p.body,
    attachmentUrl: p.attachmentUrl,
    attachmentName: p.attachmentName,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/news", requireAuth(), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      post: newsPostsTable,
      authorEmail: usersTable.email,
      authorEmployeeName: employeesTable.name,
    })
    .from(newsPostsTable)
    .innerJoin(usersTable, eq(usersTable.id, newsPostsTable.authorId))
    .leftJoin(employeesTable, eq(employeesTable.userId, usersTable.id))
    .orderBy(desc(newsPostsTable.createdAt));
  res.json(
    rows.map((r) =>
      serialize(r.post, r.authorEmployeeName ?? r.authorEmail ?? "HR"),
    ),
  );
});

router.post("/news", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const parsed = CreateNewsPostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid news post payload" });
    return;
  }
  const userId = req.session.userId!;
  const data = parsed.data;
  const inserted = await db
    .insert(newsPostsTable)
    .values({
      authorId: userId,
      title: data.title,
      body: data.body ?? "",
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentName: data.attachmentName ?? null,
    })
    .$returningId();
  const postId = inserted[0]?.id;
  if (!postId) {
    res.status(500).json({ message: "Failed to create post" });
    return;
  }
  const postRows = await db
    .select()
    .from(newsPostsTable)
    .where(eq(newsPostsTable.id, postId))
    .limit(1);
  const post = postRows[0];
  if (!post) {
    res.status(500).json({ message: "Created post could not be loaded" });
    return;
  }
  const authorRows = await db
    .select({
      email: usersTable.email,
      employeeName: employeesTable.name,
    })
    .from(usersTable)
    .leftJoin(employeesTable, eq(employeesTable.userId, usersTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  const author = authorRows[0];
  res
    .status(201)
    .json(serialize(post, author?.employeeName ?? author?.email ?? "HR"));
});

router.delete("/news/:id", requireAuth(["admin"]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ message: "Invalid id" });
    return;
  }
  await db.delete(newsPostsTable).where(eq(newsPostsTable.id, id));
  res.status(204).end();
});

export default router;
