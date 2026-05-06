import { Router, type IRouter } from "express";
import { GeneratePayslipBody } from "@workspace/api-zod";
import {
  attendanceTable,
  db,
  employeesTable,
  loansTable,
  loanInstallmentsTable,
  payslipsTable,
  salaryComponentsTable,
  salaryEventsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { ymd } from "../lib/dates";
import {
  computePakistanMonthlySalaryTax,
  computePayrollWorkingDaysInMonth,
  isPayrollOffDay,
  toHolidaySet,
} from "../lib/payroll";
import { getSettings } from "./settings";

const router: IRouter = Router();

type PayslipBreakdownLine = {
  label: string;
  amount: number;
};

const PAYROLL_MONTHLY_DIVISOR = 30;

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function isComponentTaxable(component: typeof salaryComponentsTable.$inferSelect) {
  return component.isTaxable === 1;
}

function resolveComponentValue(
  component: typeof salaryComponentsTable.$inferSelect,
  basicSalary: number,
) {
  return component.valueType === "percentage"
    ? (Number(component.value) / 100) * basicSalary
    : Number(component.value);
}

function isManualTaxComponent(label: string) {
  return /\btax\b/i.test(label);
}

function buildPayslipBreakdown(
  payslip: typeof payslipsTable.$inferSelect,
  employee: typeof employeesTable.$inferSelect,
  components: Array<typeof salaryComponentsTable.$inferSelect>,
) {
  const basicSalary = Number(payslip.basicSalary);
  const defaultAllowances = Number(employee.allowances);
  const homeRent = roundAmount(defaultAllowances / 2);
  const utilityBills = roundAmount(defaultAllowances - homeRent);
  const absentDays = Number(payslip.absentDays);
  const lateAbsenceDays = Number(payslip.lateAbsenceDays);

  const earnings: PayslipBreakdownLine[] = [
    { label: "Basic Salary", amount: basicSalary },
  ];
  if (homeRent > 0) earnings.push({ label: "Home Rent", amount: homeRent });
  if (utilityBills > 0) {
    earnings.push({ label: "Utility Bills", amount: utilityBills });
  }

  const deductions: PayslipBreakdownLine[] = [];
  let commissionTotal = 0;
  let taxableCommissionTotal = 0;
  let componentDeductionTotal = 0;
  let providentFundFromComponent = 0;
  let taxableRecurringComponentTotal = 0;
  let nonTaxableRecurringComponentTotal = 0;

  for (const component of components) {
    const amount = roundAmount(resolveComponentValue(component, basicSalary));
    if (amount <= 0) continue;

    if (component.isDeduction === 1 && component.kind === "provident_fund") {
      providentFundFromComponent += amount;
      deductions.push({ label: component.label, amount });
      continue;
    }

    if (component.isDeduction === 1) {
      if (isManualTaxComponent(component.label)) continue;
      componentDeductionTotal += amount;
      deductions.push({ label: component.label, amount });
      continue;
    }

    if (component.kind === "designation") continue;
    earnings.push({
      label: isComponentTaxable(component)
        ? component.label
        : `${component.label} (non-taxable)`,
      amount,
    });
    if (component.kind === "commission") {
      commissionTotal += amount;
      if (isComponentTaxable(component)) taxableCommissionTotal += amount;
      continue;
    }
    if (isComponentTaxable(component)) taxableRecurringComponentTotal += amount;
    else nonTaxableRecurringComponentTotal += amount;
  }

  const additionalBonus = roundAmount(Number(payslip.bonus) - commissionTotal);
  if (additionalBonus > 0) {
    earnings.push({ label: "Additional Bonus", amount: additionalBonus });
  }

  const providentFundFromProfile =
    providentFundFromComponent <= 0 && employee.providentFundPercent != null
      ? roundAmount((Number(employee.providentFundPercent) / 100) * basicSalary)
      : 0;
  if (providentFundFromProfile > 0) {
    deductions.push({ label: "Provident Fund", amount: providentFundFromProfile });
  }

  const recurringTaxableCompensation =
    basicSalary + defaultAllowances + taxableRecurringComponentTotal;
  const recurringGrossCompensation =
    basicSalary + defaultAllowances + taxableRecurringComponentTotal;
  const recurringGrossPerDay = recurringGrossCompensation / PAYROLL_MONTHLY_DIVISOR;
  const payrollTax = roundAmount(
    computePakistanMonthlySalaryTax(
      recurringTaxableCompensation + taxableCommissionTotal + additionalBonus,
      payslip.month,
      payslip.year,
    ),
  );
  if (payrollTax > 0) {
    deductions.push({ label: "Payroll Tax", amount: payrollTax });
  }

  const absenceDeduction = roundAmount(recurringGrossPerDay * absentDays);
  if (absenceDeduction > 0) {
    deductions.push({ label: "Absence Deduction", amount: absenceDeduction });
  }

  const latePenaltyDeduction = roundAmount(recurringGrossPerDay * lateAbsenceDays);
  if (latePenaltyDeduction > 0) {
    deductions.push({ label: "Late Penalty", amount: latePenaltyDeduction });
  }

  if (Number(payslip.loanDeduction) > 0) {
    deductions.push({
      label: "Loan Deduction",
      amount: roundAmount(Number(payslip.loanDeduction)),
    });
  }

  const manualOrResidualDeductions = roundAmount(
    Number(payslip.otherDeductions) -
      componentDeductionTotal -
      providentFundFromComponent -
      providentFundFromProfile -
      payrollTax -
      absenceDeduction -
      latePenaltyDeduction,
  );
  if (manualOrResidualDeductions > 0) {
    deductions.push({
      label: "Other Deductions",
      amount: manualOrResidualDeductions,
    });
  }

  return { earnings, deductions };
}

function serialize(
  p: typeof payslipsTable.$inferSelect,
  name: string,
  email: string,
  position?: string | null,
  breakdown?: {
    earnings: PayslipBreakdownLine[];
    deductions: PayslipBreakdownLine[];
  },
) {
  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeName: name,
    employeeEmail: email,
    employeePosition: position ?? "",
    month: p.month,
    year: p.year,
    totalWorkingDays: p.totalWorkingDays,
    presentDays: p.presentDays,
    absentDays: p.absentDays,
    paidLeaveDays: p.paidLeaveDays,
    unpaidLeaveDays: p.unpaidLeaveDays,
    lateCount: p.lateCount,
    latePenaltyDays: Number(p.lateAbsenceDays),
    lateAbsenceDays: Number(p.lateAbsenceDays),
    basicSalary: Number(p.basicSalary),
    allowances: Number(p.allowances),
    bonus: Number(p.bonus),
    loanDeduction: Number(p.loanDeduction),
    otherDeductions: Number(p.otherDeductions),
    netSalary: Number(p.netSalary),
    salaryBreakdown: breakdown,
    generatedAt: p.generatedAt.toISOString(),
  };
}

router.post("/payslips/generate", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const parsed = GeneratePayslipBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }
  const { employeeId, month, year, latePenaltyDays, bonus: bodyBonus, otherDeductions: bodyOther } = parsed.data;
  const settings = await getSettings();

  const empRows = await db
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  if (!empRows.length) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }
  const emp = empRows[0]!.employee;
  const email = empRows[0]!.email;

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = ymd(endDate);
  const holidaySet = toHolidaySet(settings);
  const totalWorkingDays = computePayrollWorkingDaysInMonth(year, month, settings);

  const attRows = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, employeeId),
        gte(attendanceTable.date, start),
        lte(attendanceTable.date, end),
      ),
    );

  let present = 0;
  let late = 0;
  let onLeave = 0;
  for (const r of attRows) {
    if (isPayrollOffDay(r.date, settings, holidaySet)) continue;
    // Approved late/half-day requests get marked excused: they don't count
    // as late, and half-day excused gets paid as a full present day.
    if (r.excused) {
      if (r.status === "on_leave") onLeave += 1;
      else present += 1;
      continue;
    }
    if (r.status === "present" || r.status === "remote_work") present += 1;
    else if (r.status === "late") {
      late += 1;
      present += 1;
    } else if (r.status === "on_leave") onLeave += 1;
    else if (r.status === "half_day") present += 0.5;
  }
  const presentDays = present;
  const paidLeaveDays = onLeave; // approved leaves are paid by default
  const unpaidLeaveDays = 0;
  const absentDays = Math.max(
    0,
    totalWorkingDays - presentDays - paidLeaveDays,
  );

  // Salary events in this month (bonus + increment only — loans now live in loans table)
  const events = await db
    .select()
    .from(salaryEventsTable)
    .where(
      and(
        eq(salaryEventsTable.employeeId, employeeId),
        gte(salaryEventsTable.date, start),
        lte(salaryEventsTable.date, end),
      ),
    );
  let eventBonus = 0;
  let incrementAdjust = 0;
  for (const e of events) {
    if (e.type === "bonus") eventBonus += Number(e.amount);
    else if (e.type === "increment") incrementAdjust += Number(e.amount);
  }

  // Salary components: replace defaults if any are configured
  const components = await db
    .select()
    .from(salaryComponentsTable)
    .where(eq(salaryComponentsTable.employeeId, employeeId));

  const designationFixed = components
    .filter(
      (c) =>
        c.kind === "designation" &&
        c.valueType === "fixed" &&
        c.isDeduction === 0,
    )
    .reduce((s, c) => s + Number(c.value), 0);
  const baseDesignation =
    designationFixed > 0
      ? designationFixed
      : Number(emp.basicSalary) + incrementAdjust;

  const evalComponent = (c: (typeof components)[number]) => {
    return c.valueType === "percentage"
      ? (Number(c.value) / 100) * baseDesignation
      : Number(c.value);
  };

  const basicSalary = baseDesignation;
  let allowances = Number(emp.allowances);
  let componentBonus = 0;
  let taxableComponentBonus = 0;
  let nonTaxableExtraAmount = 0;
  let componentDeductions = 0;
  let providentFundFromComponent = 0;
  let taxableRecurringAllowanceAdditions = 0;
  const isTaxComponent = (label: string) => /\btax\b/i.test(label);

  for (const c of components) {
    const v = evalComponent(c);
    if (c.isDeduction === 1 && c.kind === "provident_fund") {
      providentFundFromComponent += v;
      continue;
    }
    if (c.isDeduction === 1) {
      if (isTaxComponent(c.label)) continue;
      componentDeductions += v;
      continue;
    }
    if (c.kind === "designation") continue; // already in base
    if (c.kind === "commission") {
      if (isComponentTaxable(c)) {
        componentBonus += v;
        taxableComponentBonus += v;
      } else {
        nonTaxableExtraAmount += v;
      }
      continue;
    }
    if (isComponentTaxable(c)) {
      allowances += v; // taxable recurring allowance / other
      taxableRecurringAllowanceAdditions += v;
    } else {
      nonTaxableExtraAmount += v;
    }
  }

  // PF from employee.providentFundPercent (if no PF component already set)
  const pfFromProfile =
    providentFundFromComponent <= 0 && emp.providentFundPercent != null
      ? (Number(emp.providentFundPercent) / 100) * baseDesignation
      : 0;
  const bonus =
    eventBonus + componentBonus + nonTaxableExtraAmount + Number(bodyBonus ?? 0);

  const recurringGrossCompensation = basicSalary + allowances;
  const recurringTaxableCompensation =
    basicSalary + Number(emp.allowances) + taxableRecurringAllowanceAdditions;
  const perDay = recurringGrossCompensation / PAYROLL_MONTHLY_DIVISOR;
  const absenceDeduction = perDay * absentDays;

  // Late → absence policy: forgive `lateGraceCount` lates, then 1 absence
  // per `lateAbsenceEvery` extra lates (floor). HR can override with
  // `latePenaltyDays`.
  const lateAbsenceEvery = Math.max(1, settings.lateAbsenceEvery ?? 3);
  const extraLates = Math.max(0, late - settings.lateGraceCount);
  const computedPenaltyDays = Math.floor(extraLates / lateAbsenceEvery);
  const effectivePenaltyDays =
    latePenaltyDays != null
      ? Math.max(0, Number(latePenaltyDays))
      : computedPenaltyDays;
  const lateDeduction = perDay * effectivePenaltyDays;
  const taxDeduction = computePakistanMonthlySalaryTax(
    recurringTaxableCompensation +
      taxableComponentBonus +
      eventBonus +
      Number(bodyBonus ?? 0),
    month,
    year,
  );

  // Loan installments: pay off active loans for this month
  const activeLoans = await db
    .select()
    .from(loansTable)
    .where(
      and(eq(loansTable.employeeId, employeeId), eq(loansTable.status, "active")),
    );

  let loanDeduction = 0;
  // We compute candidate deductions but only persist after upserting payslip
  type Pending = {
    loanId: number;
    amount: number;
    closeAfter: boolean;
  };
  const pendingInstallments: Pending[] = [];

  for (const loan of activeLoans) {
    // Skip if loan hasn't started yet for this period
    const loanStart = loan.startYear * 12 + (loan.startMonth - 1);
    const period = year * 12 + (month - 1);
    if (period < loanStart) continue;

    // Skip if already paid for this month/year
    const already = await db
      .select()
      .from(loanInstallmentsTable)
      .where(
        and(
          eq(loanInstallmentsTable.loanId, loan.id),
          eq(loanInstallmentsTable.month, month),
          eq(loanInstallmentsTable.year, year),
        ),
      )
      .limit(1);
    if (already.length) {
      // Re-generation: subtract the already-paid amount so it's still represented
      loanDeduction += Number(already[0]!.amount);
      continue;
    }

    const paidAlready = await db
      .select({ sum: loanInstallmentsTable.amount })
      .from(loanInstallmentsTable)
      .where(eq(loanInstallmentsTable.loanId, loan.id));
    const paidTotal = paidAlready.reduce((s, r) => s + Number(r.sum), 0);
    const principal = Number(loan.principalAmount);
    const remaining = principal - paidTotal;
    if (remaining <= 0) continue;
    const perMonth =
      Math.round((principal / Math.max(1, loan.monthsToRepay)) * 100) / 100;
    const due = Math.min(perMonth, Math.round(remaining * 100) / 100);
    if (due <= 0) continue;
    loanDeduction += due;
    pendingInstallments.push({
      loanId: loan.id,
      amount: due,
      closeAfter: paidTotal + due >= principal - 0.005,
    });
  }

  const otherDeductions =
    Math.round(
      (absenceDeduction +
        lateDeduction +
        componentDeductions +
        providentFundFromComponent +
        pfFromProfile +
        taxDeduction +
        Number(bodyOther ?? 0)) *
        100,
    ) / 100;
  const netSalary =
    Math.round(
      (basicSalary + allowances + bonus - loanDeduction - otherDeductions) *
        100,
    ) / 100;

  // Upsert
  const existing = await db
    .select()
    .from(payslipsTable)
    .where(
      and(
        eq(payslipsTable.employeeId, employeeId),
        eq(payslipsTable.month, month),
        eq(payslipsTable.year, year),
      ),
    )
    .limit(1);

  let payslip: typeof payslipsTable.$inferSelect;
  if (existing.length) {
    await db
      .update(payslipsTable)
      .set({
        totalWorkingDays,
        presentDays,
        absentDays,
        paidLeaveDays,
        unpaidLeaveDays,
        lateCount: late,
        lateAbsenceDays: String(Math.round(effectivePenaltyDays * 100) / 100),
        basicSalary: String(basicSalary),
        allowances: String(allowances),
        bonus: String(bonus),
        loanDeduction: String(Math.round(loanDeduction * 100) / 100),
        otherDeductions: String(otherDeductions),
        netSalary: String(netSalary),
        generatedAt: new Date(),
      })
      .where(eq(payslipsTable.id, existing[0]!.id));
    const updatedRows = await db
      .select()
      .from(payslipsTable)
      .where(eq(payslipsTable.id, existing[0]!.id))
      .limit(1);
    payslip = updatedRows[0]!;
  } else {
    const inserted = await db
      .insert(payslipsTable)
      .values({
        employeeId,
        month,
        year,
        totalWorkingDays,
        presentDays,
        absentDays,
        paidLeaveDays,
        unpaidLeaveDays,
        lateCount: late,
        lateAbsenceDays: String(Math.round(effectivePenaltyDays * 100) / 100),
        basicSalary: String(basicSalary),
        allowances: String(allowances),
        bonus: String(bonus),
        loanDeduction: String(Math.round(loanDeduction * 100) / 100),
        otherDeductions: String(otherDeductions),
        netSalary: String(netSalary),
      })
      .$returningId();
    const payslipId = inserted[0]?.id;
    const insertedRows = payslipId
      ? await db
          .select()
          .from(payslipsTable)
          .where(eq(payslipsTable.id, payslipId))
          .limit(1)
      : [];
    payslip = insertedRows[0]!;
  }

  // Persist new installments + close any loans that are fully paid
  for (const p of pendingInstallments) {
    await db.insert(loanInstallmentsTable).values({
      loanId: p.loanId,
      employeeId,
      month,
      year,
      amount: String(p.amount),
      payslipId: payslip.id,
    });
    if (p.closeAfter) {
      await db
        .update(loansTable)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(loansTable.id, p.loanId));
    }
  }

  const out = serialize(
    payslip,
    emp.name,
    email,
    emp.position,
    buildPayslipBreakdown(payslip, emp, components),
  );
  res.status(201).json(out);
});

router.get("/payslips/me", requireAuth(["employee"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.json([]);
    return;
  }
  const empRows = await db
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;
  const components = await db
    .select()
    .from(salaryComponentsTable)
    .where(eq(salaryComponentsTable.employeeId, user.employeeId));
  const rows = await db
    .select()
    .from(payslipsTable)
    .where(eq(payslipsTable.employeeId, user.employeeId))
    .orderBy(desc(payslipsTable.year), desc(payslipsTable.month));
  res.json(
    rows.map((p) =>
      serialize(
        p,
        emp.employee.name,
        emp.email,
        emp.employee.position,
        buildPayslipBreakdown(p, emp.employee, components),
      ),
    ),
  );
});

router.get(
  "/payslips/employee/:id",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const empRows = await db
      .select({ employee: employeesTable, email: usersTable.email })
      .from(employeesTable)
      .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
      .where(eq(employeesTable.id, id))
      .limit(1);
    if (!empRows.length) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }
    const emp = empRows[0]!;
    const components = await db
      .select()
      .from(salaryComponentsTable)
      .where(eq(salaryComponentsTable.employeeId, id));
    const rows = await db
      .select()
      .from(payslipsTable)
      .where(eq(payslipsTable.employeeId, id))
      .orderBy(desc(payslipsTable.year), desc(payslipsTable.month));
    res.json(
      rows.map((p) =>
        serialize(
          p,
          emp.employee.name,
          emp.email,
          emp.employee.position,
          buildPayslipBreakdown(p, emp.employee, components),
        ),
      ),
    );
  },
);

router.get("/payslips/:id", requireAuth(), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = getUser(req);
  const rows = await db
    .select({
      p: payslipsTable,
      employee: employeesTable,
      email: usersTable.email,
    })
    .from(payslipsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, payslipsTable.employeeId))
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(payslipsTable.id, id))
    .limit(1);
  if (!rows.length) {
    res.status(404).json({ message: "Payslip not found" });
    return;
  }
  const row = rows[0]!;
  if (user.role === "employee" && user.employeeId !== row.p.employeeId) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  const components = await db
    .select()
    .from(salaryComponentsTable)
    .where(eq(salaryComponentsTable.employeeId, row.p.employeeId));
  res.json(
    serialize(
      row.p,
      row.employee.name,
      row.email,
      row.employee.position,
      buildPayslipBreakdown(row.p, row.employee, components),
    ),
  );
});

export default router;
