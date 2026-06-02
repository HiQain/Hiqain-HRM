import { Router, type IRouter } from "express";
import { db, employeesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserByEmail, verifyPassword } from "../lib/auth";
import { getUser, requireAuth } from "../lib/auth";
import {
  authenticateAttendanceExtensionToken,
  connectAttendanceExtension,
  connectAttendanceExtensionForEmployee,
  createAttendanceExtensionCode,
  disconnectAttendanceExtension,
  disconnectAttendanceExtensionByToken,
  ensureAttendanceExtensionCode,
  getAdminAttendanceExtensionStatuses,
  getAttendanceExtensionStatus,
  processAttendanceExtensionHeartbeat,
} from "../lib/attendanceExtension";

const router: IRouter = Router();

function extractBearerToken(value: string | undefined) {
  if (!value) return "";
  const [scheme, token] = value.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : "";
}

router.get(
  "/attendance/extension/status",
  requireAuth(["employee"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    res.json(await getAttendanceExtensionStatus(user.employeeId));
  },
);

router.get(
  "/attendance/extension/admin-status",
  requireAuth(["admin", "hr"]),
  async (_req, res): Promise<void> => {
    res.json(await getAdminAttendanceExtensionStatuses());
  },
);

router.post(
  "/attendance/extension/link",
  requireAuth(["employee"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    try {
      res.json(await createAttendanceExtensionCode(user.employeeId));
    } catch (error) {
      res.status(403).json({
        message: error instanceof Error ? error.message : "Could not create extension code",
      });
    }
  },
);

router.post(
  "/attendance/extension/disconnect",
  requireAuth(["employee"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    res.json(await disconnectAttendanceExtension(user.employeeId));
  },
);

router.post("/attendance/extension/connect", async (req, res): Promise<void> => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const deviceName =
    typeof req.body?.deviceName === "string" ? req.body.deviceName : null;
  if (!code.trim()) {
    res.status(400).json({ message: "Connection code is required" });
    return;
  }

  try {
    res.json(await connectAttendanceExtension(code, deviceName));
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Could not connect extension",
    });
  }
});

router.post("/attendance/extension/login", async (req, res): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const deviceName =
    typeof req.body?.deviceName === "string" ? req.body.deviceName : null;

  if (!email || !password) {
    res.status(400).json({ message: "Email and password are required" });
    return;
  }

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
  if (user.role !== "employee" && user.role !== "hr") {
    res.status(403).json({ message: "Only employee accounts can connect the extension" });
    return;
  }
  const employeeRows = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.userId, user.id))
    .limit(1);
  const employeeId = employeeRows[0]?.id;
  if (!employeeId) {
    res.status(400).json({ message: "No employee profile found" });
    return;
  }

  try {
    // We use the employee-linked account directly instead of a one-time code.
    res.json(await connectAttendanceExtensionForEmployee(employeeId, deviceName));
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Could not connect extension",
    });
  }
});

router.post(
  "/attendance/extension/disconnect-token",
  async (req, res): Promise<void> => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ message: "Missing extension token" });
      return;
    }
    const ok = await disconnectAttendanceExtensionByToken(token);
    if (!ok) {
      res.status(401).json({ message: "Invalid extension token" });
      return;
    }
    res.json({ success: true });
  },
);

router.post("/attendance/extension/heartbeat", async (req, res): Promise<void> => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: "Missing extension token" });
    return;
  }
  if (!(await authenticateAttendanceExtensionToken(token))) {
    res.status(401).json({ message: "Invalid extension token" });
    return;
  }

  const state =
    req.body?.state === "active" ||
    req.body?.state === "idle" ||
    req.body?.state === "locked" ||
    req.body?.state === "offline"
      ? req.body.state
      : null;
  if (!state) {
    res.status(400).json({ message: "Invalid extension state" });
    return;
  }

  const detectedAt =
    typeof req.body?.detectedAt === "string" ? new Date(req.body.detectedAt) : new Date();
  const lastActiveAt =
    typeof req.body?.lastActiveAt === "string" ? new Date(req.body.lastActiveAt) : null;
  const idleStartedAt =
    typeof req.body?.idleStartedAt === "string" ? new Date(req.body.idleStartedAt) : null;
  const idleForMinutes =
    typeof req.body?.idleForMinutes === "number" && Number.isFinite(req.body.idleForMinutes)
      ? Math.max(0, Math.floor(req.body.idleForMinutes))
      : null;
  const deviceName =
    typeof req.body?.deviceName === "string" ? req.body.deviceName : null;
  const browserAlive =
    typeof req.body?.browserAlive === "boolean" ? req.body.browserAlive : null;
  const networkOnline =
    typeof req.body?.networkOnline === "boolean" ? req.body.networkOnline : null;
  const extensionVersion =
    typeof req.body?.extensionVersion === "string" ? req.body.extensionVersion : null;

  try {
    res.json(
      await processAttendanceExtensionHeartbeat({
        token,
        state,
        detectedAt,
        lastActiveAt,
        idleStartedAt,
        idleForMinutes,
        deviceName,
        browserAlive,
        networkOnline,
        extensionVersion,
      }),
    );
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : "Could not process heartbeat",
    });
  }
});

router.post(
  "/attendance/extension/prepare",
  requireAuth(["employee"]),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user.employeeId) {
      res.status(400).json({ message: "No employee profile" });
      return;
    }
    res.json(await ensureAttendanceExtensionCode(user.employeeId));
  },
);

export default router;
