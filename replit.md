# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## HiQain — HR Management

A full-stack HRM web app for HiQain, built on top of the workspace stack.

### Artifacts
- `artifacts/api-server` — Express API at `/api`, session auth (express-session + connect-pg-simple), bcryptjs password hashing.
- `artifacts/hrm` — React + Vite frontend (TanStack Query + shadcn/ui + Tailwind v4 + wouter).

### Roles & seeded accounts
- Admin: `admin@hiqain.com` / `password`.
- Sample employees (must change password on first login): various `@hiqain.com` accounts / `welcome123`.

### Features
- Auth: login, logout, change password, force-change on first login.
- Employees: full CRUD, profile, journey timeline (joining, probation start/end, anniversaries, birthdays, salary events, "left" event). Add Employee form includes Account role select (`employee` / `admin`). Bulk CSV upload via `/employees/bulk`. Journey has search filter.
- Extended employee profile fields: employeeCode, leftDate, emergencyContact, cnic, lastQualification, previousCompany, lastPay, benefits, notes, immediateFamily.
- Salary events: add/edit/delete bonus, loan, increment, and commission per employee. Increment also updates employee's basicSalary (edits reverse the prior increment effect before reapplying). Increment and Commission support a Fixed/Percentage toggle — when set to percentage, server resolves the amount from the employee's basic salary at submit time and stores both the resolved amount and `percentValue`/`amountMode`.
- Designation changes appear on the Journey timeline with a dedicated icon (`designation_change`).
- My Attendance page shows weekly + monthly worked-hours stat cards, with the workspace targets from Settings.
- Sidebar: collapsible on desktop too — chevron in the sidebar header collapses it, floating panel button reopens it. Open/closed state is persisted in localStorage.
- Employee self-edit (Additional details card) supports phone, address, CNIC, emergency contact, last qualification, date of birth, and family members.
- Attendance: check-in/out with grace period and lateness. Monthly views for self and admin, daily summary. Times shown in Asia/Karachi timezone (12-hour format).
- Leaves: per-employee admin-controlled quotas for sick/casual/annual. Apply, approve/reject — approval auto-marks attendance as `on_leave`. Quota enforced at apply time.
- Attendance statuses include `half_day` (auto on checkout < 50% office hours) and `remote_work`. Color-coded badges.
- Check-in is blocked when the employee has an approved leave for that day.
- Admin Attendance Calendar: monthly grid per employee with click-to-override.
- Employee Attendance Calendar: read-only monthly grid of the signed-in member's attendance.
- Requests (unified): `general_requests` covers `half_day`, `loan`, `increment`, `remote_work`, `late`, `resignation`, and `other`. Multi-day date range supported for half_day and remote_work. Members submit at `/employee/requests`; admins review at `/admin/requests`.
- Mentions on requests: "Tag members" picker lists every HRM user with an employee profile.
- Employees have a `positionType` (`onsite`/`remote`); remote employees are auto-marked `remote_work` on check-in.
- Payslips: generate per employee/month/year. Blocked for current and future months. PDF includes HiQain logo, "System generated. No signature required." footer. Employee code shown from employeeCode field. PayslipView and PDF show an attendance summary (Working / Present / Absent / Late → absence days applied).
- Late → absence policy (Settings → "Late → absence policy"): formula `floor((lateCount − grace) ÷ everyN) = absence days`. Defaults: `lateGraceCount=2`, `lateAbsenceEvery=3` (so 5 lates → 1 absence, 8 lates → 2 absences). HR can leverage per-payslip via "Late → absence days (HR leverage)" on the Payslips page, or per-employee via the inline override in the "Payroll snapshot" card on the Salary tab of the Employee Detail page. Persisted on payslip as `lateAbsenceDays`. Legacy `lateDeductionFraction` column is kept for back-compat but no longer used by the formula or shown in the UI.
- Excused attendance (`attendance.excused` boolean): when an admin/HR approves a `late`, `half_day`, or `remote_work` request, the corresponding attendance rows are marked `excused=true`. The payroll generator skips late counting on excused rows and pays excused half-days as full present days, so approved requests never cause a deduction. The Today's Attendance table shows an "Excused" badge on these rows.
- Today's Attendance (admin): the table now has an inline "Change status" select per row that calls the existing `/api/attendance/override` endpoint, refreshes the summary, and lets HR/admin correct any record without leaving the page.
- Employee Detail → Salary tab → "Payroll snapshot" (admin only): per-employee live view of the selected month showing late marks, derived absence days (using current settings), active loan balance + monthly installment, and the current payslip's net pay / late absence days / absent days / other deductions / bonus. Includes inline override of late-derived absence days and a button to generate or recalculate the payslip without leaving the page.
- Loan requests (in Requests system, type=`loan`): eligibility requires `tenureMonths ≥ settings.loanMinTenureMonths` (default 12 = 1 year) and no other active loan. Max amount = `(basicSalary + allowances) × loanMaxSalaryMultiplier` (default ×1 = one month salary). Employee picks installment months at submit; HR/admin can override months and approve/reject in `ApproveLoanDialog`. Approved loans deduct an installment per payslip until closed; loan deduction shows on payslip.
- Dashboards: admin (team-wide stats, pending leaves, recent salary events, upcoming birthdays/anniversaries) and employee (today's attendance hero, month stats, leave balance, recent leaves).
- Feed (`/admin/feed`, `/employee/feed`): celebrates today's birthdays + work anniversaries with avatars + age/years; lists upcoming over the next 60 days. A celebratory popup appears once per day on first sign-in (gated by `localStorage["hiqain.celebrationsSeen"]`).
- Multi-attachments on Leaves and Requests: each leave/general/remote-work request stores an `attachments: { url, name }[]` array (legacy `attachmentUrl/Name` mirror the first item for back-compat). UI uses `MultiAttachmentField` for picking multiple files at once.
- Dark mode toggle (Moon/Sun) in sidebar; persisted via localStorage.
- Employee status: "Permanent" (was "Confirmed") after probation.
- Global Settings (admin): defaults CL 6 / SL 6 / AL 12, salary 50/50, PF 5%. Computed `dailyHours`/`weeklyHours`/`monthlyHours` returned by GET `/api/settings` (from office times, weekly off days, and current month working days minus public holidays). Leave quota changes always auto-propagate to every employee on save (no toggle). PF is auto-enabled whenever `defaultProvidentFundPercent > 0` (no toggle). Attendance policy and Company policy each support text OR file (mutually exclusive via tab toggle). Text mode uses a custom `RichTextEditor` component (contentEditable + execCommand) with a Word-style toolbar (bold/italic/underline, H1/H2, lists, quote, link, undo/redo, clear formatting); content stored as HTML and rendered via `RichTextView` using `dangerouslySetInnerHTML` (admin-authored, internal users only). Public holidays carry an optional `country` tag (`us` | `pk` | `other`) — admin gets two separate "Load US 2026" / "Load Pakistan 2026" buttons and All/US/PK filter tabs with country badges. Employees see a read-only `/employee/settings` page that uses **their own** office hours (not the global defaults) for the per-day / per-week / per-month calculations and shows their own leave quotas; same holiday filter tabs apply.

### Implementation notes
- API responds with structured errors as `{ error: string }` and uses session cookies.
- The session table `user_sessions` is created in code on startup.
- Frontend uses generated React Query hooks from `@workspace/api-client-react`. Wouter base = `import.meta.env.BASE_URL.replace(/\/$/, "")`.
- jsPDF is bundled at the artifact level.
- OpenAPI-first: all API changes must update `lib/api-spec/openapi.yaml` then run codegen.
- DB schema uses Drizzle ORM; new columns added to `lib/db/src/schema/` and applied via `executeSql` directly.
