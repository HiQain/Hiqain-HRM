import type { Employee, GeneralRequest, Payslip } from "@workspace/api-client-react";

export type ProvidentFundLedgerEntry = {
  key: string;
  date: string;
  label: string;
  kind: "contribution" | "withdrawal";
  status: "approved" | "pending" | "rejected";
  amount: number;
  effectiveAmount: number;
  balance: number;
  detail?: string;
};

export type ProvidentFundSummary = {
  eligibleAfterDate: string;
  probationCompleted: boolean;
  oneYearCompleted: boolean;
  canWithdraw: boolean;
  totalContributed: number;
  totalWithdrawn: number;
  pendingWithdrawals: number;
  currentBalance: number;
  availableToRequest: number;
  ledger: ProvidentFundLedgerEntry[];
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function fmtYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addYears(dateStr: string, years: number) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date;
}

function getPfAmountFromPayslip(payslip: Payslip) {
  const deductions =
    (
      payslip as Payslip & {
        salaryBreakdown?: {
          deductions?: Array<{ label: string; amount?: number | null }>;
        } | null;
      }
    ).salaryBreakdown?.deductions ?? [];
  return round2(
    deductions
      .filter((line) => /provident fund/i.test(line.label))
      .reduce((sum, line) => sum + Number(line.amount ?? 0), 0),
  );
}

function isContributionEligibleForBalance(
  payslip: Payslip,
  probationEndDate: string,
) {
  const periodEnd = new Date(Date.UTC(payslip.year, payslip.month, 0));
  const probationEnd = new Date(`${probationEndDate}T00:00:00Z`);
  return periodEnd.getTime() > probationEnd.getTime();
}

function sortEntries(entries: ProvidentFundLedgerEntry[]) {
  return [...entries].sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) return dateDiff;
    if (a.kind === b.kind) return a.key.localeCompare(b.key);
    return a.kind === "contribution" ? -1 : 1;
  });
}

export function buildProvidentFundSummary(
  employee: Pick<Employee, "joiningDate" | "probationEndDate">,
  payslips: Payslip[],
  requests: GeneralRequest[],
): ProvidentFundSummary {
  const oneYearAfterJoining = addYears(employee.joiningDate, 1);
  const probationEnd = new Date(`${employee.probationEndDate}T00:00:00Z`);
  const eligibleAfterDate = new Date(
    Math.max(oneYearAfterJoining.getTime(), probationEnd.getTime() + 86400000),
  );
  const today = new Date();

  const contributions = payslips
    .map((payslip) => {
      const amount = getPfAmountFromPayslip(payslip);
      return {
        payslip,
        amount,
      };
    })
    .filter(
      ({ payslip, amount }) =>
        amount > 0 &&
        isContributionEligibleForBalance(payslip, employee.probationEndDate),
    )
    .map(({ payslip, amount }) => ({
      key: `payslip-${payslip.id}`,
      date: `${payslip.year}-${String(payslip.month).padStart(2, "0")}-01`,
      label: `PF contribution · ${payslip.month}/${payslip.year}`,
      kind: "contribution" as const,
      status: "approved" as const,
      amount,
      effectiveAmount: amount,
      balance: 0,
      detail: `Generated with payslip for ${payslip.month}/${payslip.year}`,
    }));

  const withdrawals = requests
    .filter((request) => (request.type as string) === "pf_withdrawal" && (request.amount ?? 0) > 0)
    .map((request) => {
      const status = request.status;
      const amount = round2(Number(request.amount ?? 0));
      const effectiveAmount = status === "approved" ? -amount : 0;
      return {
        key: `request-${request.id}`,
        date: (status === "approved" ? request.reviewedAt : request.appliedAt ?? request.date)?.slice(0, 10) ?? request.date,
        label: "PF withdrawal request",
        kind: "withdrawal" as const,
        status,
        amount,
        effectiveAmount,
        balance: 0,
        detail: request.reason,
      };
    });

  let runningBalance = 0;
  const ledger = sortEntries([...contributions, ...withdrawals]).map((entry) => {
    runningBalance = round2(runningBalance + entry.effectiveAmount);
    return {
      ...entry,
      balance: runningBalance,
    };
  });

  const totalContributed = round2(
    contributions.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const totalWithdrawn = round2(
    withdrawals
      .filter((entry) => entry.status === "approved")
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const pendingWithdrawals = round2(
    withdrawals
      .filter((entry) => entry.status === "pending")
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const currentBalance = round2(totalContributed - totalWithdrawn);
  const availableToRequest = Math.max(0, round2(currentBalance - pendingWithdrawals));

  return {
    eligibleAfterDate: fmtYmd(eligibleAfterDate),
    probationCompleted: today.getTime() > probationEnd.getTime(),
    oneYearCompleted: today.getTime() >= oneYearAfterJoining.getTime(),
    canWithdraw:
      today.getTime() >= eligibleAfterDate.getTime() && currentBalance > 0,
    totalContributed,
    totalWithdrawn,
    pendingWithdrawals,
    currentBalance,
    availableToRequest,
    ledger,
  };
}
