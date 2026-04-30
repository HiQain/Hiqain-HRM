import { Router, type IRouter } from "express";
import {
  LoginBody,
  ChangePasswordBody,
} from "@workspace/api-zod";
import { db, usersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getSessionUser,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid login payload" });
  }
  const { email, password } = parsed.data;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid email or password" });
  }
  req.session.userId = user.id;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
  const session = await getSessionUser(req);
  return res.json({ user: session });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

router.get("/auth/me", async (req, res) => {
  const user = await getSessionUser(req);
  if (!user) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  return res.json(user);
});

router.post("/auth/change-password", requireAuth(), async (req, res) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }
  const userId = req.session.userId!;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) return res.status(401).json({ message: "Not authenticated" });

  if (!user.mustChangePassword) {
    if (!parsed.data.currentPassword) {
      return res
        .status(400)
        .json({ message: "Current password is required" });
    }
    const ok = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
  }

  const hash = await hashPassword(parsed.data.newPassword);
  await db
    .update(usersTable)
    .set({ passwordHash: hash, mustChangePassword: false })
    .where(eq(usersTable.id, userId));

  // Invalidate all other active sessions for this user so any other device
  // / browser they were logged in on is signed out. Keep the current session
  // (where the password change happened) so the user stays signed in here.
  const currentSid = req.sessionID;
  await pool.query(
    `DELETE FROM "user_sessions"
     WHERE (sess->>'userId')::int = $1
       AND sid <> $2`,
    [userId, currentSid],
  );

  res.json({ success: true });
});

export default router;
