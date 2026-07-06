import { createHash, randomBytes } from "node:crypto";
import {
  attendanceExtensionLinksTable,
  db,
  employeesTable,
} from "@workspace/db";
import { and, asc, eq, isNotNull, lt } from "drizzle-orm";
import {
  attendanceSessionState,
  autoCheckOutAttendance,
  autoPauseAttendance,
  autoResumeAttendance,
  loadAttendanceContext,
} from "./attendanceAutoActions";
import { logger } from "./logger";
import { notifyEmployeeUser, notifyRoles } from "./notifications";

type ExtensionState = "active" | "idle" | "locked" | "offline";

export const EXTENSION_IDLE_PAUSE_MINUTES = 10;
export const EXTENSION_WARNING_MINUTES = 20;
export const EXTENSION_AUTO_CHECKOUT_MINUTES = 30;
const CONNECT_CODE_TTL_MINUTES = 15;
const DISCONNECT_GRACE_MINUTES = 30;

type LinkRow = typeof attendanceExtensionLinksTable.$inferSelect;

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function generateConnectionCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

function generateAccessToken() {
  return `hrmext_${randomBytes(24).toString("hex")}`;
}

function minutesBetween(later: Date, earlier: Date | null | undefined) {
  if (!earlier) return 0;
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 60000));
}

function isManuallyPausedSession(
  record: NonNullable<Awaited<ReturnType<typeof loadAttendanceContext>>>["record"] | null | undefined,
  link: Pick<LinkRow, "autoPausedAt">,
) {
  return !!record?.pausedAt && !link.autoPausedAt;
}

function serializeLink(link: LinkRow | null) {
  if (!link) return null;
  const connected = link.status === "connected" && !!link.accessTokenHash;
  const now = new Date();
  const idleForMinutes =
    connected && link.lastState && link.lastState !== "active"
      ? minutesBetween(now, link.lastIdleStartedAt)
      : 0;
  const warningActive =
    connected &&
    !!link.lastHeartbeatAt &&
    !!link.lastIdleStartedAt &&
    !!link.lastState &&
    link.lastState !== "active" &&
    idleForMinutes >= EXTENSION_WARNING_MINUTES &&
    idleForMinutes < EXTENSION_AUTO_CHECKOUT_MINUTES;
  const warningCountdownMinutes = warningActive
    ? Math.max(0, EXTENSION_AUTO_CHECKOUT_MINUTES - idleForMinutes)
    : null;
  return {
    connected,
    status: link.status,
    deviceName: link.deviceName ?? null,
    lastState: connected ? (link.lastState ?? null) : null,
    lastHeartbeatAt: connected ? link.lastHeartbeatAt?.toISOString() ?? null : null,
    lastActiveAt: connected ? link.lastActiveAt?.toISOString() ?? null : null,
    lastWarningAt: connected ? link.lastWarningAt?.toISOString() ?? null : null,
    idleForMinutes,
    heartbeatStaleMinutes: connected ? minutesBetween(now, link.lastHeartbeatAt) : 0,
    browserAlive:
      connected && typeof link.browserAlive === "number" ? Boolean(link.browserAlive) : null,
    networkOnline:
      connected && typeof link.networkOnline === "number" ? Boolean(link.networkOnline) : null,
    extensionVersion: connected ? (link.extensionVersion ?? null) : null,
    disconnectedAt: link.disconnectedAt?.toISOString() ?? null,
    warningActive,
    warningCountdownMinutes,
    pendingCode: link.status === "pending" ? link.connectionCode ?? null : null,
    codeExpiresAt: link.status === "pending" ? link.codeExpiresAt?.toISOString() ?? null : null,
    connectedAt: link.connectedAt?.toISOString() ?? null,
  };
}

async function getLinkByEmployeeId(employeeId: number) {
  const rows = await db
    .select()
    .from(attendanceExtensionLinksTable)
    .where(eq(attendanceExtensionLinksTable.employeeId, employeeId))
    .limit(1);
  return rows[0] ?? null;
}

async function getEmployeeById(employeeId: number) {
  const rows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  return rows[0] ?? null;
}

export async function ensureAttendanceExtensionEmployee(employeeId: number) {
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new Error("Employee not found");
  }
  return employee;
}

async function getLinkByToken(token: string) {
  const rows = await db
    .select()
    .from(attendanceExtensionLinksTable)
    .where(eq(attendanceExtensionLinksTable.accessTokenHash, hashToken(token)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAttendanceExtensionStatus(employeeId: number) {
  const employee = await getEmployeeById(employeeId);
  const link = await getLinkByEmployeeId(employeeId);
  return {
    eligible: !!employee,
    link: serializeLink(link),
    thresholds: {
      pauseMinutes: EXTENSION_IDLE_PAUSE_MINUTES,
      warningMinutes: EXTENSION_WARNING_MINUTES,
      checkoutMinutes: EXTENSION_AUTO_CHECKOUT_MINUTES,
    },
  };
}

export async function getAdminAttendanceExtensionStatuses() {
  const employees = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      employeeCode: employeesTable.employeeCode,
      department: employeesTable.department,
      position: employeesTable.position,
    })
    .from(employeesTable)
    .orderBy(asc(employeesTable.name));

  return Promise.all(
    employees.map(async (employee) => {
      const link = await getLinkByEmployeeId(employee.id);
      const status = await loadAttendanceContext(employee.id);
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.employeeCode ?? null,
        department: employee.department ?? null,
        position: employee.position ?? null,
        attendanceState: attendanceSessionState(status?.record ?? null),
        extension: serializeLink(link),
      };
    }),
  );
}

export async function createAttendanceExtensionCode(employeeId: number) {
  await ensureAttendanceExtensionEmployee(employeeId);
  const existing = await getLinkByEmployeeId(employeeId);
  const code = generateConnectionCode();
  const expiresAt = new Date(Date.now() + CONNECT_CODE_TTL_MINUTES * 60_000);

  if (existing) {
    await db
      .update(attendanceExtensionLinksTable)
      .set({
        status: "pending",
        connectionCode: code,
        codeExpiresAt: expiresAt,
        accessTokenHash: null,
        lastState: null,
        lastHeartbeatAt: null,
        lastActiveAt: null,
        lastIdleStartedAt: null,
        lastWarningAt: null,
        autoPausedAt: null,
        disconnectedAt: null,
      })
      .where(eq(attendanceExtensionLinksTable.id, existing.id));
  } else {
    await db.insert(attendanceExtensionLinksTable).values({
      employeeId,
      status: "pending",
      connectionCode: code,
      codeExpiresAt: expiresAt,
      disconnectedAt: null,
    });
  }

  return getAttendanceExtensionStatus(employeeId);
}

export async function ensureAttendanceExtensionCode(employeeId: number) {
  await ensureAttendanceExtensionEmployee(employeeId);
  const existing = await getLinkByEmployeeId(employeeId);
  if (
    existing?.status === "connected" ||
    (existing?.status === "pending" &&
      existing.codeExpiresAt &&
      existing.codeExpiresAt.getTime() > Date.now())
  ) {
    return getAttendanceExtensionStatus(employeeId);
  }
  return createAttendanceExtensionCode(employeeId);
}

export async function disconnectAttendanceExtension(employeeId: number) {
  const existing = await getLinkByEmployeeId(employeeId);
  if (!existing) return getAttendanceExtensionStatus(employeeId);
  const now = new Date();

  await db
    .update(attendanceExtensionLinksTable)
    .set({
      status: "revoked",
      connectionCode: null,
      codeExpiresAt: null,
      accessTokenHash: null,
      lastState: "offline",
      lastWarningAt: null,
      autoPausedAt: null,
      disconnectedAt: now,
    })
    .where(eq(attendanceExtensionLinksTable.id, existing.id));

  await autoPauseAttendance(
    employeeId,
    now,
    "Attendance auto-paused because the browser extension was manually disconnected.",
    "auto_paused_extension_disconnect",
  );
  await notifyEmployeeUser(employeeId, {
    type: "attendance",
    title: "Extension disconnected",
    message:
      "Your browser extension was disconnected. Attendance has been auto-paused and will auto check out after 30 minutes if you do not reconnect or check out manually.",
    href: "/employee/settings",
  });
  await notifyRoles(["admin", "hr"], {
    type: "attendance",
    title: "Employee extension disconnected",
    message:
      "An employee manually disconnected the attendance browser extension. The session was auto-paused and will be forced to check out after 30 minutes if not restored.",
    href: "/admin/extension-activity",
  });

  return getAttendanceExtensionStatus(employeeId);
}

export async function disconnectAttendanceExtensionByToken(token: string) {
  const link = await getLinkByToken(token);
  if (!link) return false;
  const now = new Date();
  await db
    .update(attendanceExtensionLinksTable)
    .set({
      status: "revoked",
      accessTokenHash: null,
      connectionCode: null,
      codeExpiresAt: null,
      lastState: "offline",
      lastWarningAt: null,
      autoPausedAt: null,
      disconnectedAt: now,
    })
    .where(eq(attendanceExtensionLinksTable.id, link.id));
  await autoPauseAttendance(
    link.employeeId,
    now,
    "Attendance auto-paused because the browser extension was manually disconnected.",
    "auto_paused_extension_disconnect",
  );
  await notifyEmployeeUser(link.employeeId, {
    type: "attendance",
    title: "Extension disconnected",
    message:
      "Your browser extension was disconnected. Attendance has been auto-paused and will auto check out after 30 minutes if you do not reconnect or check out manually.",
    href: "/employee/settings",
  });
  await notifyRoles(["admin", "hr"], {
    type: "attendance",
    title: "Employee extension disconnected",
    message:
      "An employee manually disconnected the attendance browser extension. The session was auto-paused and will be forced to check out after 30 minutes if not restored.",
    href: "/admin/extension-activity",
  });
  return true;
}

export async function connectAttendanceExtension(
  connectionCode: string,
  deviceName?: string | null,
) {
  const rows = await db
    .select({
      link: attendanceExtensionLinksTable,
      employeeName: employeesTable.name,
    })
    .from(attendanceExtensionLinksTable)
    .innerJoin(
      employeesTable,
      eq(employeesTable.id, attendanceExtensionLinksTable.employeeId),
    )
    .where(eq(attendanceExtensionLinksTable.connectionCode, connectionCode.trim().toUpperCase()))
    .limit(1);
  const row = rows[0];
  if (!row?.link) {
    throw new Error("Invalid connection code");
  }
  const employee = await ensureAttendanceExtensionEmployee(row.link.employeeId);
  if (!row.link.codeExpiresAt || row.link.codeExpiresAt.getTime() < Date.now()) {
    throw new Error("Connection code expired. Generate a new one from HRM.");
  }

  const token = generateAccessToken();
  const now = new Date();
  await db
    .update(attendanceExtensionLinksTable)
    .set({
      status: "connected",
      accessTokenHash: hashToken(token),
      connectionCode: null,
      codeExpiresAt: null,
      deviceName: deviceName?.trim() || row.link.deviceName || "Employee browser",
      connectedAt: now,
      lastState: "active",
      lastHeartbeatAt: now,
      lastActiveAt: now,
      lastIdleStartedAt: null,
      lastWarningAt: null,
      autoPausedAt: null,
    })
    .where(eq(attendanceExtensionLinksTable.id, row.link.id));

  return {
    accessToken: token,
    employeeId: row.link.employeeId,
    employeeName: employee.name ?? row.employeeName,
    deviceName: deviceName?.trim() || row.link.deviceName || "Employee browser",
    thresholds: {
      pauseMinutes: EXTENSION_IDLE_PAUSE_MINUTES,
      warningMinutes: EXTENSION_WARNING_MINUTES,
      checkoutMinutes: EXTENSION_AUTO_CHECKOUT_MINUTES,
    },
  };
}

export async function connectAttendanceExtensionForEmployee(
  employeeId: number,
  deviceName?: string | null,
) {
  const employee = await ensureAttendanceExtensionEmployee(employeeId);
  const rows = await db
    .select({
      link: attendanceExtensionLinksTable,
      employeeName: employeesTable.name,
    })
    .from(employeesTable)
    .leftJoin(
      attendanceExtensionLinksTable,
      eq(attendanceExtensionLinksTable.employeeId, employeesTable.id),
    )
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Employee profile not found");
  }

  const token = generateAccessToken();
  const now = new Date();
  if (row.link) {
    await db
      .update(attendanceExtensionLinksTable)
      .set({
        status: "connected",
        accessTokenHash: hashToken(token),
        connectionCode: null,
        codeExpiresAt: null,
        deviceName: deviceName?.trim() || row.link.deviceName || "Employee browser",
        connectedAt: now,
        lastState: "active",
        lastHeartbeatAt: now,
        lastActiveAt: now,
        lastIdleStartedAt: null,
        lastWarningAt: null,
        autoPausedAt: null,
      })
      .where(eq(attendanceExtensionLinksTable.id, row.link.id));
  } else {
    await db.insert(attendanceExtensionLinksTable).values({
      employeeId,
      status: "connected",
      accessTokenHash: hashToken(token),
      deviceName: deviceName?.trim() || "Employee browser",
      connectedAt: now,
      lastState: "active",
      lastHeartbeatAt: now,
      lastActiveAt: now,
      lastIdleStartedAt: null,
      lastWarningAt: null,
      autoPausedAt: null,
    });
  }

  return {
    accessToken: token,
    employeeId,
    employeeName: employee.name ?? row.employeeName,
    deviceName: deviceName?.trim() || row.link?.deviceName || "Employee browser",
    thresholds: {
      pauseMinutes: EXTENSION_IDLE_PAUSE_MINUTES,
      warningMinutes: EXTENSION_WARNING_MINUTES,
      checkoutMinutes: EXTENSION_AUTO_CHECKOUT_MINUTES,
    },
  };
}

export async function authenticateAttendanceExtensionToken(token: string) {
  if (!token) return null;
  const link = await getLinkByToken(token);
  if (!link || link.status !== "connected") return null;
  return link;
}

export async function processAttendanceExtensionHeartbeat(args: {
  token: string;
  state: ExtensionState;
  detectedAt?: Date;
  lastActiveAt?: Date | null;
  idleStartedAt?: Date | null;
  idleForMinutes?: number | null;
  deviceName?: string | null;
  browserAlive?: boolean | null;
  networkOnline?: boolean | null;
  extensionVersion?: string | null;
}) {
  const link = await authenticateAttendanceExtensionToken(args.token);
  if (!link) {
    throw new Error("Extension session is invalid. Reconnect from HRM.");
  }
  await ensureAttendanceExtensionEmployee(link.employeeId);

  const now = args.detectedAt ?? new Date();
  const state = args.state;
  const lastActiveAt =
    state === "active" ? now : args.lastActiveAt ?? link.lastActiveAt ?? null;
  const idleStartedAt =
    state === "active"
      ? null
      : args.idleStartedAt ?? link.lastIdleStartedAt ?? now;
  const idleForMinutes =
    state === "active"
      ? 0
      : args.idleForMinutes ?? minutesBetween(now, idleStartedAt);

  let action: "none" | "paused" | "resumed" | "warned" | "checked_out" = "none";
  const statusBefore = await loadAttendanceContext(link.employeeId, now);
  const sessionBefore = attendanceSessionState(statusBefore?.record ?? null);
  const manuallyPausedBefore = isManuallyPausedSession(
    statusBefore?.record,
    link,
  );

  if (state === "active") {
    if (link.autoPausedAt) {
      const resumed = await autoResumeAttendance(link.employeeId, now);
      if (resumed.changed) {
        action = "resumed";
      }
    }
  } else if (!manuallyPausedBefore && idleForMinutes >= EXTENSION_AUTO_CHECKOUT_MINUTES) {
    const checkedOut = await autoCheckOutAttendance(link.employeeId, now);
    if (checkedOut.changed) {
      action = "checked_out";
    }
  } else if (!manuallyPausedBefore && idleForMinutes >= EXTENSION_WARNING_MINUTES) {
    const warnedRecently =
      link.lastWarningAt &&
      idleStartedAt &&
      link.lastWarningAt.getTime() >= idleStartedAt.getTime();
    if (!warnedRecently) {
      action = "warned";
    }
    if (sessionBefore === "active") {
      const paused = await autoPauseAttendance(link.employeeId, now);
      if (paused.changed) {
        action = action === "warned" ? "warned" : "paused";
      }
    }
  } else if (!manuallyPausedBefore && idleForMinutes >= EXTENSION_IDLE_PAUSE_MINUTES) {
    const paused = await autoPauseAttendance(link.employeeId, now);
    if (paused.changed) {
      action = "paused";
    }
  }

  const statusAfter = await loadAttendanceContext(link.employeeId, now);
  const sessionAfter = attendanceSessionState(statusAfter?.record ?? null);
  await db
    .update(attendanceExtensionLinksTable)
    .set({
      deviceName: args.deviceName?.trim() || link.deviceName || "Employee browser",
      lastState: state,
      lastHeartbeatAt: now,
      lastActiveAt,
      lastIdleStartedAt: idleStartedAt,
      browserAlive:
        typeof args.browserAlive === "boolean" ? Number(args.browserAlive) : link.browserAlive,
      networkOnline:
        typeof args.networkOnline === "boolean"
          ? Number(args.networkOnline)
          : link.networkOnline,
      extensionVersion: args.extensionVersion?.trim() || link.extensionVersion,
      disconnectedAt: null,
      lastWarningAt:
        action === "warned" ? now : state === "active" ? null : link.lastWarningAt,
      autoPausedAt:
        action === "paused"
          ? now
          : action === "resumed" || action === "checked_out" || state === "active"
            ? null
            : link.autoPausedAt,
    })
    .where(eq(attendanceExtensionLinksTable.id, link.id));

  return {
    ok: true,
    action,
    shouldWarn: action === "warned",
    attendanceState: sessionAfter,
    lastHeartbeatAt: now.toISOString(),
    idleForMinutes,
    employeeId: link.employeeId,
  };
}

export async function runAttendanceExtensionOfflineSweep() {
  const now = new Date();
  const threshold = new Date(
    now.getTime() - EXTENSION_AUTO_CHECKOUT_MINUTES * 60_000,
  );
  const disconnectGraceThreshold = new Date(
    now.getTime() - DISCONNECT_GRACE_MINUTES * 60_000,
  );
  const links = await db
    .select()
    .from(attendanceExtensionLinksTable)
    .where(
      and(
        eq(attendanceExtensionLinksTable.status, "connected"),
        isNotNull(attendanceExtensionLinksTable.lastHeartbeatAt),
        lt(attendanceExtensionLinksTable.lastHeartbeatAt, threshold),
      ),
    );
  const disconnectedLinks = await db
    .select()
    .from(attendanceExtensionLinksTable)
    .where(
      and(
        eq(attendanceExtensionLinksTable.status, "revoked"),
        isNotNull(attendanceExtensionLinksTable.disconnectedAt),
        lt(attendanceExtensionLinksTable.disconnectedAt, disconnectGraceThreshold),
      ),
    );

  for (const link of links) {
    try {
      const employee = await getEmployeeById(link.employeeId);
      if (!employee) {
        continue;
      }
      const status = await loadAttendanceContext(link.employeeId, now);
      if (isManuallyPausedSession(status?.record, link)) {
        await db
          .update(attendanceExtensionLinksTable)
          .set({
            lastState: "offline",
            lastWarningAt: null,
            autoPausedAt: null,
          })
          .where(eq(attendanceExtensionLinksTable.id, link.id));
        continue;
      }
      const checkedOut = await autoCheckOutAttendance(
        link.employeeId,
        now,
        "Auto checked out after browser extension heartbeats stopped for 30 minutes.",
        "auto_checkout_stale_connection",
      );
      await db
        .update(attendanceExtensionLinksTable)
        .set({
          lastState: "offline",
          lastWarningAt: null,
          autoPausedAt: null,
        })
        .where(eq(attendanceExtensionLinksTable.id, link.id));

      if (checkedOut.changed) {
        logger.info(
          { employeeId: link.employeeId, linkId: link.id },
          "Auto checked out stale browser-extension attendance session",
        );
      }
    } catch (error) {
      logger.error(
        { err: error, employeeId: link.employeeId, linkId: link.id },
        "Could not process stale browser-extension attendance session",
      );
    }
  }

  for (const link of disconnectedLinks) {
    try {
      const employee = await getEmployeeById(link.employeeId);
      if (!employee) {
        continue;
      }
      const status = await loadAttendanceContext(link.employeeId, now);
      if (isManuallyPausedSession(status?.record, link)) {
        await db
          .update(attendanceExtensionLinksTable)
          .set({
            disconnectedAt: null,
          })
          .where(eq(attendanceExtensionLinksTable.id, link.id));
        continue;
      }
      const checkedOut = await autoCheckOutAttendance(
        link.employeeId,
        now,
        "Auto checked out 30 minutes after the browser extension was manually disconnected.",
        "auto_checkout_extension_disconnected",
      );
      await db
        .update(attendanceExtensionLinksTable)
        .set({
          disconnectedAt: null,
        })
        .where(eq(attendanceExtensionLinksTable.id, link.id));

      if (checkedOut.changed) {
        await notifyEmployeeUser(link.employeeId, {
          type: "attendance",
          title: "Attendance auto checked out",
          message:
            "Your attendance was automatically checked out because the browser extension stayed disconnected for 30 minutes.",
          href: "/employee/attendance",
        });
        await notifyRoles(["admin", "hr"], {
          type: "attendance",
          title: "Attendance auto checked out after disconnect",
          message:
            "An employee remained disconnected from the attendance extension for 30 minutes and was automatically checked out.",
          href: "/admin/extension-activity",
        });
        logger.info(
          { employeeId: link.employeeId, linkId: link.id },
          "Auto checked out manually disconnected browser-extension attendance session",
        );
      }
    } catch (error) {
      logger.error(
        { err: error, employeeId: link.employeeId, linkId: link.id },
        "Could not process manually disconnected browser-extension attendance session",
      );
    }
  }
}

let monitorStarted = false;

export function startAttendanceExtensionMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const timer = setInterval(() => {
    runAttendanceExtensionOfflineSweep().catch((error) => {
      logger.error({ err: error }, "Attendance extension sweep failed");
    });
  }, 60_000);
  timer.unref?.();
}
