import { Router, type IRouter } from "express";
import {
  attendanceTable,
  db,
  employeesTable,
  generalRequestsTable,
  loansTable,
  payslipsTable,
  salaryComponentsTable,
  salaryEventsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { addMonths, diffMonths, parseDate, ymd } from "../lib/dates";
import { notifyEmployeeUser, notifyRoles } from "../lib/notifications";
import {
  getMatchedProvidentFundContribution,
  getProvidentFundPolicyStartDate,
  isProvidentFundPolicyActiveForPeriod,
  resolveProvidentFundPercent,
} from "../lib/provident-fund-policy";
import { applyPermanentIncrementToCompensation } from "../lib/salary";
import { getSettings } from "./settings";
import { computeLoanEligibility } from "./loans";

const router: IRouter = Router();

async function loadMentioned(ids: number[] | null | undefined) {
  if (!ids || ids.length === 0) return [];
  return db
    .select({ id: employeesTable.id, name: employeesTable.name })
    .from(employeesTable)
    .where(inArray(employeesTable.id, ids));
}

type AttachmentItem = { url: string; name: string };
type RequestType =
  | "half_day"
  | "loan"
  | "increment"
  | "remote_work"
  | "late"
  | "pf_withdrawal"
  | "resignation"
  | "other";

function mergedAttachments(r: {
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachments: AttachmentItem[] | null;
}): AttachmentItem[] {
  const list = Array.isArray(r.attachments) ? [...r.attachments] : [];
  if (
    r.attachmentUrl &&
    r.attachmentName &&
    !list.some((a) => a.url === r.attachmentUrl)
  ) {
    list.unshift({ url: r.attachmentUrl, name: r.attachmentName });
  }
  return list;
}

function normalizeAttachments(
  body: { attachments?: unknown },
): AttachmentItem[] | undefined {
  if (!Array.isArray(body.attachments)) return undefined;
  const out: AttachmentItem[] = [];
  for (const a of body.attachments) {
    if (
      a &&
      typeof a === "object" &&
      typeof (a as { url?: unknown }).url === "string" &&
      typeof (a as { name?: unknown }).name === "string"
    ) {
      out.push({
        url: (a as { url: string }).url,
        name: (a as { name: string }).name,
      });
    }
  }
  return out;
}

async function serialize(
  r: typeof generalRequestsTable.$inferSelect,
  employeeName: string,
) {
  const mentions = await loadMentioned(r.mentionedEmployeeIds ?? []);
  return {
    id: r.id,
    employeeId: r.employeeId,
    employeeName,
    type: r.type,
    date: r.date,
    dateTo: r.dateTo ?? null,
    amount: r.amount === null ? null : Number(r.amount),
    installmentMonths: r.installmentMonths ?? null,
    reason: r.reason,
    attachmentUrl: r.attachmentUrl,
    attachmentName: r.attachmentName,
    attachments: mergedAttachments(r),
    mentionedEmployeeIds: r.mentionedEmployeeIds ?? [],
    mentionedEmployees: mentions,
    status: r.status,
    appliedAt: r.appliedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}

function subtractDay(d: Date): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() - 1);
  return r;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveComponentValue(
  component: typeof salaryComponentsTable.$inferSelect,
  basicSalary: number,
) {
  return component.valueType === "percentage"
    ? (Number(component.value) / 100) * basicSalary
    : Number(component.value);
}

async function computeProvidentFundBalance(
  employeeId: number,
  opts?: { excludeRequestId?: number; includePending?: boolean },
) {
  const settings = await getSettings();
  const employeeRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const employee = employeeRows[0];
  if (!employee) {
    throw new Error("Employee not found");
  }

  const joiningDate = parseDate(employee.joiningDate);
  const probationEndDate = subtractDay(
    addMonths(joiningDate, employee.probationMonths),
  );
  const oneYearAfterJoining = addMonths(joiningDate, 12);
  const policyStartDate = getProvidentFundPolicyStartDate();
  const withdrawalEligibleFrom = new Date(
    Math.max(
      oneYearAfterJoining.getTime(),
      probationEndDate.getTime() + 86400000,
      policyStartDate.getTime(),
    ),
  );
  const now = new Date();

  const payslips = await db
    .select()
    .from(payslipsTable)
    .where(eq(payslipsTable.employeeId, employeeId))
    .orderBy(desc(payslipsTable.year), desc(payslipsTable.month));
  const components = await db
    .select()
    .from(salaryComponentsTable)
    .where(eq(salaryComponentsTable.employeeId, employeeId));
  const effectiveProvidentFundPercent = resolveProvidentFundPercent(
    employee.providentFundPercent,
    settings.defaultProvidentFundPercent,
  );

  const totalContributed = round2(
    payslips.reduce((sum, payslip) => {
      const periodEnd = new Date(Date.UTC(payslip.year, payslip.month, 0));
      if (periodEnd.getTime() <= probationEndDate.getTime()) return sum;
      if (!isProvidentFundPolicyActiveForPeriod(payslip.month, payslip.year)) {
        return sum;
      }

      const basicSalary = Number(payslip.basicSalary);
      const pfFromComponent = components
        .filter((component) => component.isDeduction === 1 && component.kind === "provident_fund")
        .reduce(
          (componentSum, component) =>
            componentSum + resolveComponentValue(component, basicSalary),
          0,
        );
      const pfFromProfile =
        pfFromComponent <= 0 && effectiveProvidentFundPercent > 0
          ? (effectiveProvidentFundPercent / 100) * basicSalary
          : 0;
      return (
        sum +
        getMatchedProvidentFundContribution(pfFromComponent + pfFromProfile)
      );
    }, 0),
  );

  const withdrawalRows = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.employeeId, employeeId));

  const approvedWithdrawals = round2(
    withdrawalRows
      .filter(
        (row) =>
          (row.type as string) === "pf_withdrawal" &&
          row.status === "approved" &&
          row.id !== opts?.excludeRequestId,
      )
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const pendingWithdrawals = round2(
    withdrawalRows
      .filter(
        (row) =>
          (row.type as string) === "pf_withdrawal" &&
          row.status === "pending" &&
          row.id !== opts?.excludeRequestId,
      )
      .reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  );
  const currentBalance = round2(totalContributed - approvedWithdrawals);
  const availableBalance = Math.max(
    0,
    round2(
      currentBalance - (opts?.includePending ? pendingWithdrawals : 0),
    ),
  );

  return {
    employee,
    probationEndDate: ymd(probationEndDate),
    withdrawalEligibleFrom: ymd(withdrawalEligibleFrom),
    oneYearCompleted: diffMonths(joiningDate, now) >= 12,
    probationCompleted: now.getTime() > probationEndDate.getTime(),
    policyStarted: now.getTime() >= policyStartDate.getTime(),
    currentBalance,
    availableBalance,
  };
}

async function validateProvidentFundWithdrawal(
  employeeId: number,
  amount: number,
  opts?: { excludeRequestId?: number; includePending?: boolean },
) {
  const summary = await computeProvidentFundBalance(employeeId, opts);
  if (!summary.oneYearCompleted) {
    return {
      ok: false as const,
      message: `PF withdrawal is available only after 1 year of service. Eligible after ${summary.withdrawalEligibleFrom}.`,
    };
  }
  if (!summary.probationCompleted) {
    return {
      ok: false as const,
      message: `PF starts after probation. Probation completes on ${summary.probationEndDate}.`,
    };
  }
  if (!summary.policyStarted) {
    return {
      ok: false as const,
      message: `PF policy starts on ${ymd(getProvidentFundPolicyStartDate())}.`,
    };
  }
  if (amount <= 0) {
    return {
      ok: false as const,
      message: "Withdrawal amount must be greater than 0.",
    };
  }
  if (summary.availableBalance <= 0) {
    return {
      ok: false as const,
      message: "No PF balance is available for withdrawal yet.",
    };
  }
  if (amount > summary.availableBalance) {
    return {
      ok: false as const,
      message: `Withdrawal amount cannot exceed available PF balance of ${summary.availableBalance}.`,
    };
  }
  return { ok: true as const, summary };
}

router.get("/requests", requireAuth(), async (req, res): Promise<void> => {
  const user = getUser(req);
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;
  const selfOnly = req.query.self === "1";
  const filters = [];
  if (user.role === "employee" || (user.role === "hr" && selfOnly)) {
    if (!user.employeeId) {
      res.json([]);
      return;
    }
    filters.push(eq(generalRequestsTable.employeeId, user.employeeId));
  }
  const validTypes = [
    "half_day",
    "loan",
    "increment",
    "remote_work",
    "late",
    "pf_withdrawal",
    "resignation",
    "other",
  ] as const;
  if (type && (validTypes as readonly string[]).includes(type)) {
    filters.push(
      eq(generalRequestsTable.type, type as any),
    );
  }
  if (status === "pending" || status === "approved" || status === "rejected") {
    filters.push(eq(generalRequestsTable.status, status));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const rows = await db
    .select({ r: generalRequestsTable, name: employeesTable.name })
    .from(generalRequestsTable)
    .innerJoin(
      employeesTable,
      eq(employeesTable.id, generalRequestsTable.employeeId),
    )
    .where(where ?? undefined)
    .orderBy(desc(generalRequestsTable.appliedAt));

  const out = await Promise.all(rows.map(({ r, name }) => serialize(r, name)));
  res.json(out);
});

function dateRange(start: string, end: string | null | undefined): string[] {
  if (!end || end <= start) return [start];
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = s; d.getTime() <= e.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

router.post("/requests", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.status(400).json({ message: "No employee profile" });
    return;
  }
  const {
    type,
    date,
    dateTo,
    amount,
    installmentMonths,
    reason,
    attachmentUrl,
    attachmentName,
    mentionedEmployeeIds,
  } = req.body ?? {};
  const validRequestTypes = [
    "half_day",
    "loan",
    "increment",
    "remote_work",
    "late",
    "pf_withdrawal",
    "resignation",
    "other",
  ];
  if (
    !type ||
    !validRequestTypes.includes(type) ||
    !date ||
    !reason ||
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    res
      .status(400)
      .json({ message: "type, date and reason are required" });
    return;
  }
  if (
    (type === "loan" || type === "increment" || type === "pf_withdrawal") &&
    (amount == null || isNaN(Number(amount)) || Number(amount) <= 0)
  ) {
    res
      .status(400)
      .json({ message: "Amount is required for loan, increment and PF withdrawal requests" });
    return;
  }

  if (type === "loan") {
    const eligibility = await computeLoanEligibility(user.employeeId);
    if (!eligibility.eligible) {
      res.status(400).json({
        message: eligibility.reason ?? "Not eligible for a loan right now",
      });
      return;
    }
    if (Number(amount) > eligibility.maxAmount) {
      res.status(400).json({
        message: `Loan amount cannot exceed ${eligibility.maxAmount}`,
      });
      return;
    }
    if (
      installmentMonths == null ||
      !Number.isInteger(Number(installmentMonths)) ||
      Number(installmentMonths) < 1
    ) {
      res
        .status(400)
        .json({ message: "Installment months is required (must be >= 1)" });
      return;
    }
  }

  if (type === "pf_withdrawal") {
    const validation = await validateProvidentFundWithdrawal(
      user.employeeId,
      Number(amount),
      { includePending: true },
    );
    if (!validation.ok) {
      res.status(400).json({ message: validation.message });
      return;
    }
  }

  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;

  const attachmentsArr = normalizeAttachments(req.body ?? {}) ?? [];
  const firstAtt = attachmentsArr[0];
  const inserted = await db
    .insert(generalRequestsTable)
    .values({
      employeeId: user.employeeId,
      type,
      date,
      dateTo: dateTo ?? null,
      amount: amount != null ? String(amount) : null,
      installmentMonths:
        type === "loan" && installmentMonths != null
          ? Number(installmentMonths)
          : null,
      reason: reason.trim(),
      attachmentUrl: attachmentUrl ?? firstAtt?.url ?? null,
      attachmentName: attachmentName ?? firstAtt?.name ?? null,
      attachments: attachmentsArr,
      mentionedEmployeeIds: Array.isArray(mentionedEmployeeIds)
        ? mentionedEmployeeIds
        : [],
      status: "pending",
    })
    .$returningId();
  const requestId = inserted[0]?.id;
  if (!requestId) {
    res.status(500).json({ message: "Failed to create request" });
    return;
  }
  const insertedRows = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.id, requestId))
    .limit(1);
  const request = insertedRows[0];
  if (!request) {
    res.status(500).json({ message: "Created request could not be loaded" });
    return;
  }
  await notifyRoles(["admin", "hr"], {
    type: "general_request",
    title: "New request submitted",
    message: `${emp.name} submitted a ${String(type).replace(/_/g, " ")} request.`,
    href: "/admin/requests",
  });
  await notifyEmployeeUser(user.employeeId, {
    type: "general_request",
    title: "Request submitted",
    message: "Your request has been submitted for review.",
    href: "/employee/requests",
  });
  res.status(201).json(await serialize(request, emp.name));
});

router.patch("/requests/:id", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const existing = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.id, id))
    .limit(1);
  const row = existing[0];
  if (!row) {
    res.status(404).json({ message: "Request not found" });
    return;
  }
  if (row.employeeId !== user.employeeId) {
    res.status(403).json({ message: "Not your request" });
    return;
  }
  if (row.status !== "pending") {
    res
      .status(400)
      .json({ message: "Only pending requests can be edited" });
    return;
  }

  const body = req.body ?? {};
  const nextType = (body.type ?? row.type) as RequestType;
  const nextAmount =
    body.amount === undefined
      ? row.amount != null
        ? Number(row.amount)
        : null
      : body.amount != null
        ? Number(body.amount)
        : null;

  if (
    (nextType === "loan" || nextType === "increment" || nextType === "pf_withdrawal") &&
    (nextAmount == null || Number.isNaN(nextAmount) || nextAmount <= 0)
  ) {
    res.status(400).json({
      message: "Amount is required for loan, increment and PF withdrawal requests",
    });
    return;
  }

  if (nextType === "pf_withdrawal") {
    const validation = await validateProvidentFundWithdrawal(
      row.employeeId,
      Number(nextAmount),
      { excludeRequestId: row.id, includePending: true },
    );
    if (!validation.ok) {
      res.status(400).json({ message: validation.message });
      return;
    }
  }

  await db
    .update(generalRequestsTable)
    .set({
      type: (body.type ?? row.type) as any,
      date: body.date ?? row.date,
      dateTo: body.dateTo !== undefined ? (body.dateTo ?? null) : row.dateTo,
      amount:
        body.amount === undefined
          ? row.amount
          : body.amount != null
            ? String(body.amount)
            : null,
      installmentMonths:
        body.installmentMonths === undefined
          ? row.installmentMonths
          : body.installmentMonths != null
            ? Number(body.installmentMonths)
            : null,
      reason: typeof body.reason === "string" ? body.reason : row.reason,
      attachmentUrl:
        body.attachmentUrl === undefined
          ? row.attachmentUrl
          : body.attachmentUrl,
      attachmentName:
        body.attachmentName === undefined
          ? row.attachmentName
          : body.attachmentName,
      attachments: normalizeAttachments(body) ?? row.attachments ?? [],
      mentionedEmployeeIds: Array.isArray(body.mentionedEmployeeIds)
        ? body.mentionedEmployeeIds
        : (row.mentionedEmployeeIds ?? []),
    })
    .where(eq(generalRequestsTable.id, id))
    ;
  const updatedRows = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.id, id))
    .limit(1);
  const updated = updatedRows[0];
  if (!updated) {
    res.status(404).json({ message: "Request not found" });
    return;
  }
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, updated.employeeId))
    .limit(1);
  res.json(await serialize(updated, empRows[0]?.name ?? ""));
});

router.delete("/requests/:id", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const existing = await db
    .select()
    .from(generalRequestsTable)
    .where(eq(generalRequestsTable.id, id))
    .limit(1);
  const row = existing[0];
  if (!row) {
    res.status(404).json({ message: "Request not found" });
    return;
  }
  if (row.employeeId !== user.employeeId) {
    res.status(403).json({ message: "Not your request" });
    return;
  }
  if (row.status !== "pending") {
    res
      .status(400)
      .json({ message: "Only pending requests can be cancelled" });
    return;
  }
  await db.delete(generalRequestsTable).where(eq(generalRequestsTable.id, id));
  res.json({ ok: true });
});

router.post(
  "/requests/:id/approve",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existingRow = await db
      .select()
      .from(generalRequestsTable)
      .where(eq(generalRequestsTable.id, id))
      .limit(1);
    if (!existingRow.length) {
      res.status(404).json({ message: "Request not found" });
      return;
    }
    const existing = existingRow[0]!;

    // For loan, allow override of installment months from body
    let approvedMonths: number | null = existing.installmentMonths;
    if (existing.type === "loan") {
      const body = req.body ?? {};
      if (body.installmentMonths != null) {
        const m = Number(body.installmentMonths);
        if (!Number.isInteger(m) || m < 1) {
          res
            .status(400)
            .json({ message: "installmentMonths must be a positive integer" });
          return;
        }
        approvedMonths = m;
      }
      if (approvedMonths == null) {
        const settings = await getSettings();
        approvedMonths = settings.loanDefaultMonths;
      }
    } else if ((existing.type as string) === "pf_withdrawal") {
      const validation = await validateProvidentFundWithdrawal(
        existing.employeeId,
        Number(existing.amount ?? 0),
        { excludeRequestId: existing.id, includePending: false },
      );
      if (!validation.ok) {
        res.status(400).json({ message: validation.message });
        return;
      }
    }

    const updateResult = await db
      .update(generalRequestsTable)
      .set({
        status: "approved",
        reviewedAt: new Date(),
        installmentMonths: approvedMonths ?? existing.installmentMonths,
      })
      .where(eq(generalRequestsTable.id, id))
      ;
    if (!updateResult[0].affectedRows) {
      res.status(404).json({ message: "Request not found" });
      return;
    }
    const updatedRows = await db
      .select()
      .from(generalRequestsTable)
      .where(eq(generalRequestsTable.id, id))
      .limit(1);
    const row = updatedRows[0]!;

    // Side effects
    if (
      row.type === "half_day" ||
      row.type === "remote_work" ||
      row.type === "late"
    ) {
      // Approved late/half-day/remote-work: mark the relevant attendance
      // rows excused so payroll does NOT deduct anything for them.
      const newStatus =
        row.type === "half_day"
          ? "half_day"
          : row.type === "remote_work"
            ? "remote_work"
            : null; // late: keep whatever status is already on the row
      const dates = dateRange(row.date, row.dateTo);
      for (const d of dates) {
        const existingAtt = await db
          .select()
          .from(attendanceTable)
          .where(
            and(
              eq(attendanceTable.employeeId, row.employeeId),
              eq(attendanceTable.date, d),
            ),
          )
          .limit(1);
        if (existingAtt.length) {
          const setVals: Partial<typeof attendanceTable.$inferInsert> = {
            excused: true,
          };
          if (newStatus) setVals.status = newStatus;
          await db
            .update(attendanceTable)
            .set(setVals)
            .where(eq(attendanceTable.id, existingAtt[0]!.id));
        } else {
          await db.insert(attendanceTable).values({
            employeeId: row.employeeId,
            date: d,
            status: newStatus ?? "late",
            excused: true,
          });
        }
      }
    } else if (row.type === "loan") {
      // Create a loans row that the payroll engine will draw from.
      const principal = Number(row.amount ?? 0);
      const months = Math.max(1, approvedMonths ?? 1);
      const startDate = new Date(row.date + "T00:00:00Z");
      // Loan repayments begin on the next month after the request date
      const nextMonth = new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1),
      );
      await db.insert(loansTable).values({
        employeeId: row.employeeId,
        requestId: row.id,
        principalAmount: String(principal),
        monthsToRepay: months,
        startMonth: nextMonth.getUTCMonth() + 1,
        startYear: nextMonth.getUTCFullYear(),
        status: "active",
        notes: row.reason,
      });
    } else if (row.type === "increment") {
      await db.insert(salaryEventsTable).values({
        employeeId: row.employeeId,
        type: row.type,
        amount: row.amount ?? "0",
        date: row.date,
        reason: row.reason,
      });
      const settings = await getSettings();
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, row.employeeId))
        .limit(1);
      const emp = empRows[0];
      if (emp) {
        const nextCompensation = applyPermanentIncrementToCompensation(
          emp,
          Number(row.amount ?? 0),
          settings,
        );
        await db
          .update(employeesTable)
          .set({
            basicSalary: String(nextCompensation.basicSalary),
            allowances: String(nextCompensation.allowances),
          })
          .where(eq(employeesTable.id, row.employeeId));
      }
    }
    // For 'late' and 'resignation' / 'other' we just record the acknowledgement.

    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, row.employeeId))
      .limit(1);
    await notifyEmployeeUser(row.employeeId, {
      type: "general_request",
      title: "Request approved",
      message: `Your ${row.type.replace(/_/g, " ")} request was approved.`,
      href: "/employee/requests",
    });
    res.json(await serialize(row, empRows[0]?.name ?? ""));
  },
);

router.post(
  "/requests/:id/reject",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const updateResult = await db
      .update(generalRequestsTable)
      .set({ status: "rejected", reviewedAt: new Date() })
      .where(eq(generalRequestsTable.id, id))
      ;
    if (!updateResult[0].affectedRows) {
      res.status(404).json({ message: "Request not found" });
      return;
    }
    const updatedRows = await db
      .select()
      .from(generalRequestsTable)
      .where(eq(generalRequestsTable.id, id))
      .limit(1);
    const row = updatedRows[0];
    if (!row) {
      res.status(404).json({ message: "Request not found" });
      return;
    }
    const empRows = await db
      .select()
      .from(employeesTable)
      .where(eq(employeesTable.id, row.employeeId))
      .limit(1);
    await notifyEmployeeUser(row.employeeId, {
      type: "general_request",
      title: "Request rejected",
      message: `Your ${row.type.replace(/_/g, " ")} request was rejected.`,
      href: "/employee/requests",
    });
    res.json(await serialize(row, empRows[0]?.name ?? ""));
  },
);

export default router;
