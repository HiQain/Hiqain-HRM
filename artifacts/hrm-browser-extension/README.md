# HRM Browser Extension

This Chrome/Edge extension connects the browser to the HRM attendance system.

## What it does

- Connects with the same HRM employee email and password already used in the app
- Sends browser idle heartbeats to HRM every minute
- Supports these backend actions:
  - auto pause after 10 minutes idle
  - warning after 20 minutes idle
  - auto check-out after 30 minutes idle
- If the browser stops sending heartbeats for 30 minutes, the backend can auto check out the open attendance session

## Load locally

1. Open `chrome://extensions` or `edge://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `artifacts/hrm-browser-extension`
5. Pin the extension from the browser toolbar so the popup stays easy to reach

## Connect

1. Log into HRM as the employee
2. Check in from the HRM dashboard as usual
3. Open `My Settings`
5. Open the extension popup from the browser toolbar
6. Enter:
   - HRM base URL
   - device name
   - HRM email
   - HRM password
7. Click `Connect`
8. Press `Sync` once if you want to send the first heartbeat immediately

## Notes

- The extension can detect browser/system idle while the browser is running
- If the browser is closed completely, the extension stops too
- In that case HRM relies on stale-heartbeat auto check-out rather than live activity detection
- HRM shows the latest heartbeat state, extension version, and warning status in `My Settings`
