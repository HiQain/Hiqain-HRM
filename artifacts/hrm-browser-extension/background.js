const HEARTBEAT_ALARM = "attendance-heartbeat";
const IDLE_DETECTION_SECONDS = 60;
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

function normalizeApiBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function getConfig() {
  const stored = await chrome.storage.local.get([
    "apiBaseUrl",
    "accessToken",
    "deviceName",
    "employeeName",
    "idleStartedAt",
    "lastActiveAt",
    "lastServerAction",
  ]);
  return {
    apiBaseUrl: normalizeApiBaseUrl(stored.apiBaseUrl),
    accessToken: stored.accessToken || "",
    deviceName: stored.deviceName || "Employee browser",
    employeeName: stored.employeeName || "",
    idleStartedAt: stored.idleStartedAt || null,
    lastActiveAt: stored.lastActiveAt || null,
    lastServerAction: stored.lastServerAction || null,
  };
}

async function ensureAlarm() {
  await chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  await chrome.alarms.create(HEARTBEAT_ALARM, {
    periodInMinutes: 1,
  });
}

async function notify(title, message) {
  await chrome.notifications.create({
    type: "basic",
    iconUrl: "logo.png",
    title,
    message,
  });
}

async function clearConnectionState(errorMessage = "") {
  await chrome.storage.local.remove([
    "accessToken",
    "employeeName",
    "idleStartedAt",
    "lastActiveAt",
    "attendanceState",
    "lastHeartbeatAt",
  ]);
  await chrome.storage.local.set({
    lastHeartbeatError: errorMessage,
    lastServerAction: "disconnected",
  });
}

async function sendHeartbeat(trigger = "timer") {
  const config = await getConfig();
  if (!config.apiBaseUrl || !config.accessToken) return;

  const state = await chrome.idle.queryState(IDLE_DETECTION_SECONDS);
  const now = new Date();
  let idleStartedAt = config.idleStartedAt;
  let lastActiveAt = config.lastActiveAt;

  if (state === "active") {
    idleStartedAt = null;
    lastActiveAt = now.toISOString();
  } else if (!idleStartedAt) {
    idleStartedAt = now.toISOString();
  }

  const idleForMinutes = idleStartedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(idleStartedAt).getTime()) / 60000))
    : 0;

  await chrome.storage.local.set({
    idleStartedAt,
    lastActiveAt,
    lastHeartbeatTrigger: trigger,
  });

  try {
    const res = await fetch(`${config.apiBaseUrl}/api/attendance/extension/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.accessToken}`,
      },
      body: JSON.stringify({
        state,
        detectedAt: now.toISOString(),
        lastActiveAt,
        idleStartedAt,
        idleForMinutes,
        deviceName: config.deviceName,
        browserAlive: true,
        networkOnline: navigator.onLine,
        extensionVersion: EXTENSION_VERSION,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        await clearConnectionState(body.message || "Extension session ended");
      }
      throw new Error(body.message || "Heartbeat rejected");
    }

    const body = await res.json();
    if (body.attendanceState === "checked_out" || body.action === "checked_out") {
      await clearConnectionState("Attendance checked out. Extension disconnected.");
      await notify(
        "HRM extension disconnected",
        "Attendance is checked out, so browser syncing has stopped.",
      );
      return;
    }
    await chrome.storage.local.set({
      lastServerAction: body.action || "none",
      lastHeartbeatAt: body.lastHeartbeatAt || now.toISOString(),
      attendanceState: body.attendanceState || "none",
    });

    if (body.shouldWarn) {
      await notify(
        "HRM inactivity warning",
        "No activity detected. HRM will auto check you out if inactivity continues.",
      );
    } else if (body.action === "paused") {
      await notify(
        "HRM attendance paused",
        "Attendance was auto-paused after inactivity.",
      );
    } else if (body.action === "resumed") {
      await notify(
        "HRM attendance resumed",
        "Attendance resumed after activity was detected.",
      );
    } else if (body.action === "checked_out") {
      await notify(
        "HRM auto check-out",
        "Attendance was auto checked out after prolonged inactivity.",
      );
    }
  } catch (error) {
    await chrome.storage.local.set({
      lastHeartbeatError:
        error instanceof Error ? error.message : "Heartbeat failed",
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    sendHeartbeat("alarm");
  }
});

chrome.idle.onStateChanged.addListener((state) => {
  chrome.storage.local.set({ lastIdleState: state });
  sendHeartbeat(`idle:${state}`);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "attendance-extension-sync") {
    sendHeartbeat("popup").then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
