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
import { workingDaysInMonth, ymd } from "../lib/dates";
import { getSettings } from "./settings";

const router: IRouter = Router();

function serialize(
  p: typeof payslipsTable.$inferSelect,
  name: string,
  email: string,
  position?: string | null,
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
    generatedAt: p.generatedAt.toISOString(),
  };
}

router.post("/payslips/generate", requireAuth(["admin", "hr"]), async (req, res) => {
  const parsed = GeneratePayslipBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }
  const { employeeId, month, year, latePenaltyDays, bonus: bodyBonus, otherDeductions: bodyOther } = parsed.data;
  const settings = await getSettings();

  const empRows = await db
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  if (!empRows.length)
    return res.status(404).json({ message: "Employee not found" });
  const emp = empRows[0]!.employee;
  const email = empRows[0]!.email;

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = ymd(endDate);
  const totalWorkingDays = workingDaysInMonth(year, month);

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
  let allowances = 0;
  let componentBonus = 0;
  let componentDeductions = 0;
  let hasNonDesignationEarning = false;
  let hasDeductionComponent = false;

  for (const c of components) {
    const v = evalComponent(c);
    if (c.isDeduction === 1) {
      componentDeductions += v;
      hasDeductionComponent = true;
      continue;
    }
    if (c.kind === "designation") continue; // already in base
    if (c.kind === "commission") componentBonus += v;
    else allowances += v; // allowance / other
    hasNonDesignationEarning = true;
  }

  if (!hasNonDesignationEarning && designationFixed === 0) {
    allowances = Number(emp.allowances);
  }

  // PF from employee.providentFundPercent (if no PF component already set)
  const pfFromProfile =
    !hasDeductionComponent && emp.providentFundPercent != null
      ? (Number(emp.providentFundPercent) / 100) * baseDesignation
      : 0;

  const bonus = eventBonus + componentBonus + Number(bodyBonus ?? 0);

  const perDay = totalWorkingDays > 0 ? baseDesignation / totalWorkingDays : 0;
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
        pfFromProfile +
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
    const updated = await db
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
      .where(eq(payslipsTable.id, existing[0]!.id))
      .returning();
    payslip = updated[0]!;
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
      .returning();
    payslip = inserted[0]!;
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

  const out = serialize(payslip, emp.name, email, emp.position);
  res.status(201).json(out);
});

router.get("/payslips/me", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId) return res.json([]);
  const empRows = await db
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const emp = empRows[0]!;
  const rows = await db
    .select()
    .from(payslipsTable)
    .where(eq(payslipsTable.employeeId, user.employeeId))
    .orderBy(desc(payslipsTable.year), desc(payslipsTable.month));
  res.json(
    rows.map((p) =>
      serialize(p, emp.employee.name, emp.email, emp.employee.position),
    ),
  );
});

router.get(
  "/payslips/employee/:id",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const empRows = await db
      .select({ employee: employeesTable, email: usersTable.email })
      .from(employeesTable)
      .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
      .where(eq(employeesTable.id, id))
      .limit(1);
    if (!empRows.length)
      return res.status(404).json({ message: "Employee not found" });
    const emp = empRows[0]!;
    const rows = await db
      .select()
      .from(payslipsTable)
      .where(eq(payslipsTable.employeeId, id))
      .orderBy(desc(payslipsTable.year), desc(payslipsTable.month));
    res.json(
      rows.map((p) =>
        serialize(p, emp.employee.name, emp.email, emp.employee.position),
      ),
    );
  },
);

router.get("/payslips/:id", requireAuth(), async (req, res) => {
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
  if (!rows.length)
    return res.status(404).json({ message: "Payslip not found" });
  const row = rows[0]!;
  if (user.role === "employee" && user.employeeId !== row.p.employeeId) {
    return res.status(403).json({ message: "Forbidden" });
  }
  res.json(serialize(row.p, row.employee.name, row.email, row.employee.position));
});

export default router;
