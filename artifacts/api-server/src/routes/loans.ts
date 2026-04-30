import { Router, type IRouter } from "express";
import {
  db,
  employeesTable,
  loansTable,
  loanInstallmentsTable,
} from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { getSettings } from "./settings";

const router: IRouter = Router();

type LoanRow = typeof loansTable.$inferSelect;
type InstallmentRow = typeof loanInstallmentsTable.$inferSelect;

function monthlyInstallment(loan: LoanRow): number {
  const months = Math.max(1, loan.monthsToRepay);
  return Math.round((Number(loan.principalAmount) / months) * 100) / 100;
}

function serializeLoan(
  loan: LoanRow,
  employeeName: string,
  installments: InstallmentRow[],
) {
  const totalPaid =
    Math.round(
      installments.reduce((s, i) => s + Number(i.amount), 0) * 100,
    ) / 100;
  const principal = Number(loan.principalAmount);
  const remainingBalance = Math.max(
    0,
    Math.round((principal - totalPaid) * 100) / 100,
  );
  return {
    id: loan.id,
    employeeId: loan.employeeId,
    employeeName,
    requestId: loan.requestId ?? null,
    principalAmount: principal,
    monthsToRepay: loan.monthsToRepay,
    startMonth: loan.startMonth,
    startYear: loan.startYear,
    status: loan.status,
    notes: loan.notes ?? null,
    totalPaid,
    remainingBalance,
    monthlyInstallment: monthlyInstallment(loan),
    createdAt: loan.createdAt.toISOString(),
    closedAt: loan.closedAt ? loan.closedAt.toISOString() : null,
    installments: installments.map((i) => ({
      id: i.id,
      loanId: i.loanId,
      employeeId: i.employeeId,
      month: i.month,
      year: i.year,
      amount: Number(i.amount),
      payslipId: i.payslipId ?? null,
      paidAt: i.paidAt.toISOString(),
    })),
  };
}

async function loadLoansForEmployees(employeeIds: number[]) {
  if (!employeeIds.length) return [];
  const loans = await db
    .select({ loan: loansTable, name: employeesTable.name })
    .from(loansTable)
    .innerJoin(employeesTable, eq(employeesTable.id, loansTable.employeeId))
    .where(
      employeeIds.length === 1
        ? eq(loansTable.employeeId, employeeIds[0]!)
        : sql`${loansTable.employeeId} IN (${sql.join(
            employeeIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )
    .orderBy(desc(loansTable.createdAt));
  if (!loans.length) return [];
  const loanIds = loans.map((l) => l.loan.id);
  const installments = await db
    .select()
    .from(loanInstallmentsTable)
    .where(
      loanIds.length === 1
        ? eq(loanInstallmentsTable.loanId, loanIds[0]!)
        : sql`${loanInstallmentsTable.loanId} IN (${sql.join(
            loanIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
    )
    .orderBy(asc(loanInstallmentsTable.year), asc(loanInstallmentsTable.month));
  const byLoan = new Map<number, InstallmentRow[]>();
  for (const i of installments) {
    const arr = byLoan.get(i.loanId) ?? [];
    arr.push(i);
    byLoan.set(i.loanId, arr);
  }
  return loans.map((l) => serializeLoan(l.loan, l.name, byLoan.get(l.loan.id) ?? []));
}

export async function computeLoanEligibility(employeeId: number) {
  const settings = await getSettings();
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const emp = empRows[0];
  if (!emp) {
    return {
      eligible: false,
      reason: "Employee not found",
      minTenureMonths: settings.loanMinTenureMonths,
      currentTenureMonths: 0,
      maxAmount: 0,
      defaultMonths: settings.loanDefaultMonths,
      hasActiveLoan: false,
    };
  }
  const joinDate = new Date(emp.joinDate + "T00:00:00Z");
  const now = new Date();
  const tenureMonths =
    (now.getUTCFullYear() - joinDate.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - joinDate.getUTCMonth()) -
    (now.getUTCDate() < joinDate.getUTCDate() ? 1 : 0);

  const activeLoans = await db
    .select()
    .from(loansTable)
    .where(
      and(eq(loansTable.employeeId, employeeId), eq(loansTable.status, "active")),
    );
  const hasActiveLoan = activeLoans.length > 0;

  const basic = Number(emp.basicSalary);
  const allowances = Number(emp.allowances);
  const grossSalary = basic + allowances;
  const maxAmount =
    Math.round(grossSalary * Number(settings.loanMaxSalaryMultiplier) * 100) /
    100;

  let eligible = true;
  let reason: string | undefined;
  if (tenureMonths < settings.loanMinTenureMonths) {
    eligible = false;
    reason = `You must complete at least ${settings.loanMinTenureMonths} months at the company before applying for a loan (you have ${Math.max(0, tenureMonths)} months).`;
  } else if (hasActiveLoan) {
    eligible = false;
    reason = "You already have an active loan. Please clear it before applying for another.";
  } else if (maxAmount <= 0) {
    eligible = false;
    reason = "Your salary is not configured. Contact HR.";
  }

  return {
    eligible,
    reason,
    minTenureMonths: settings.loanMinTenureMonths,
    currentTenureMonths: Math.max(0, tenureMonths),
    maxAmount,
    defaultMonths: settings.loanDefaultMonths,
    hasActiveLoan,
  };
}

router.get("/loans", requireAuth(["admin", "hr"]), async (_req, res) => {
  const allEmps = await db.select({ id: employeesTable.id }).from(employeesTable);
  const out = await loadLoansForEmployees(allEmps.map((e) => e.id));
  res.json(out);
});

router.get("/loans/me", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId) return res.json([]);
  const out = await loadLoansForEmployees([user.employeeId]);
  res.json(out);
});

router.get("/loans/eligibility", requireAuth(["employee"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId) {
    return res
      .status(400)
      .json({ message: "No employee profile linked to your account" });
  }
  const result = await computeLoanEligibility(user.employeeId);
  res.json(result);
});

router.get("/loans/employee/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  const user = getUser(req);
  if (user.role === "employee" && user.employeeId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const out = await loadLoansForEmployees([id]);
  res.json(out);
});

router.post("/loans/:id/cancel", requireAuth(["admin", "hr"]), async (req, res) => {
  const id = Number(req.params.id);
  const updated = await db
    .update(loansTable)
    .set({ status: "cancelled", closedAt: new Date() })
    .where(eq(loansTable.id, id))
    .returning();
  if (!updated.length) return res.status(404).json({ message: "Loan not found" });
  const out = await loadLoansForEmployees([updated[0]!.employeeId]);
  const found = out.find((l) => l.id === id);
  res.json(found ?? out[0]);
});

export default router;
