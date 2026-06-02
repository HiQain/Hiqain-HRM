const apiBaseUrlInput = document.getElementById("apiBaseUrl");
const deviceNameInput = document.getElementById("deviceName");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const statusNode = document.getElementById("status");
const connectBtn = document.getElementById("connectBtn");
const disconnectBtn = document.getElementById("disconnectBtn");
const syncBtn = document.getElementById("syncBtn");
const emailField = document.getElementById("emailField");
const passwordField = document.getElementById("passwordField");

function normalizeApiBaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  const isLocalAddress =
    /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i.test(raw) ||
    /^(10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?(?:\/|$)/i.test(
      raw,
    );
  const candidate = hasProtocol
    ? raw
    : `${isLocalAddress ? "http" : "https"}://${raw}`;
  try {
    return new URL(candidate).origin;
  } catch (_error) {
    return raw;
  }
}

function setStatus(message, tone = "info") {
  statusNode.textContent = message;
  statusNode.style.background =
    tone === "error" ? "#fef2f2" : tone === "success" ? "#ecfdf5" : "#eff6ff";
  statusNode.style.color =
    tone === "error" ? "#991b1b" : tone === "success" ? "#065f46" : "#1e3a8a";
}

function applyConnectedUi(isConnected) {
  connectBtn.hidden = isConnected;
  emailField.hidden = isConnected;
  passwordField.hidden = isConnected;
  syncBtn.hidden = !isConnected;
  disconnectBtn.hidden = !isConnected;
  apiBaseUrlInput.disabled = isConnected;
  deviceNameInput.disabled = isConnected;
}

async function loadStoredState() {
  const stored = await chrome.storage.local.get([
    "apiBaseUrl",
    "deviceName",
    "accessToken",
    "employeeName",
    "attendanceState",
    "lastHeartbeatAt",
    "lastHeartbeatError",
  ]);
  apiBaseUrlInput.value = stored.apiBaseUrl || "";
  deviceNameInput.value = stored.deviceName || "Employee browser";

  if (stored.accessToken) {
    applyConnectedUi(true);
    const name = stored.employeeName ? ` for ${stored.employeeName}` : "";
    const lastHeartbeat = stored.lastHeartbeatAt
      ? ` Last heartbeat: ${new Date(stored.lastHeartbeatAt).toLocaleString()}.`
      : "";
    setStatus(
      `Connected${name}. Attendance state: ${stored.attendanceState || "unknown"}.${lastHeartbeat}`,
      "success",
    );
  } else if (stored.lastHeartbeatError) {
    applyConnectedUi(false);
    setStatus(stored.lastHeartbeatError, "error");
  } else {
    applyConnectedUi(false);
    setStatus("Not connected");
  }
}

async function connect() {
  const apiBaseUrl = normalizeApiBaseUrl(apiBaseUrlInput.value);
  const deviceName = deviceNameInput.value.trim() || "Employee browser";
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!apiBaseUrl || !email || !password) {
    setStatus("HRM base URL, email, and password are required.", "error");
    return;
  }

  connectBtn.disabled = true;
  try {
    const res = await fetch(`${apiBaseUrl}/api/attendance/extension/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, deviceName }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.message || "Could not connect extension");
    }

    await chrome.storage.local.set({
      apiBaseUrl,
      deviceName,
      accessToken: body.accessToken,
      employeeName: body.employeeName || "",
      idleStartedAt: null,
      lastActiveAt: new Date().toISOString(),
      lastHeartbeatError: "",
    });
    passwordInput.value = "";
    setStatus(`Connected for ${body.employeeName || "employee"}.`, "success");
    await chrome.runtime.sendMessage({ type: "attendance-extension-sync" });
    await loadStoredState();
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "Could not connect extension",
      "error",
    );
  } finally {
    connectBtn.disabled = false;
  }
}

async function disconnect() {
  const stored = await chrome.storage.local.get(["apiBaseUrl", "accessToken"]);
  const apiBaseUrl = normalizeApiBaseUrl(stored.apiBaseUrl);
  const accessToken = stored.accessToken || "";

  disconnectBtn.disabled = true;
  try {
    if (apiBaseUrl && accessToken) {
      await fetch(`${apiBaseUrl}/api/attendance/extension/disconnect-token`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
    }
    await chrome.storage.local.remove([
      "apiBaseUrl",
      "accessToken",
      "employeeName",
      "idleStartedAt",
      "lastActiveAt",
      "attendanceState",
      "lastHeartbeatAt",
      "lastHeartbeatError",
    ]);
    passwordInput.value = "";
    applyConnectedUi(false);
    setStatus("Disconnected");
  } finally {
    disconnectBtn.disabled = false;
  }
}

async function syncNow() {
  syncBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: "attendance-extension-sync" });
    await loadStoredState();
  } catch (_error) {
    setStatus("Could not sync extension right now.", "error");
  } finally {
    syncBtn.disabled = false;
  }
}

connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);
syncBtn.addEventListener("click", syncNow);

loadStoredState();
