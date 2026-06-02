import { Router, type IRouter } from "express";
import {
  LoginBody,
  ChangePasswordBody,
} from "@workspace/api-zod";
import { db, pool, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getSessionUser,
  getUserByEmail,
  hashPassword,
  requireAuth,
  toBooleanFlag,
  verifyPassword,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid login payload" });
    return;
  }
  const { email, password } = parsed.data;
  const user = await getUserByEmail(email);
  if (!user) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ message: "This account is deactivated" });
    return;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }
  req.session.userId = user.id;
  await new Promise<void>((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve())),
  );
  const session = await getSessionUser(req);
  res.json({ user: session });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }
  res.json(user);
});

router.post("/auth/change-password", requireAuth(), async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }
  const userId = req.session.userId!;
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  if (!toBooleanFlag(user.mustChangePassword)) {
    if (!parsed.data.currentPassword) {
      res
        .status(400)
        .json({ message: "Current password is required" });
      return;
    }
    const ok = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!ok) {
      res.status(400).json({ message: "Current password is incorrect" });
      return;
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
  try {
    await pool.execute(
      `DELETE FROM user_sessions
       WHERE JSON_UNQUOTE(JSON_EXTRACT(CAST(sess AS JSON), '$.userId')) = ?
         AND sid <> ?`,
      [String(userId), currentSid],
    );
  } catch (error) {
    logger.warn(
      { err: error, userId },
      "Could not clear other sessions after password change",
    );
  }

  res.json({ success: true });
});

export default router;
