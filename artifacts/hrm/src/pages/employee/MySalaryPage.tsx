import { useMemo } from "react";
import {
  useGetMe,
  useGetEmployee,
  useGetSettings,
  useListSalaryComponents,
  useGetMyLoans,
  useGetMyLoanEligibility,
  useGetMyPayslips,
  getGetEmployeeQueryKey,
  getGetSettingsQueryKey,
  getListSalaryComponentsQueryKey,
  getGetMyLoansQueryKey,
  getGetMyLoanEligibilityQueryKey,
  getGetMyPayslipsQueryKey,
} from "@workspace/api-client-react";
import { Wallet, Coins, Receipt, Landmark, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDuration, formatMonth } from "@/lib/utils";
import {
  computeSalaryStructurePreview,
  getDefaultAllowanceBreakdown,
  isManualTaxComponent,
} from "@/lib/salary";

function getDisplayedPayrollTax(
  deductions: Array<{ label: string; amount: number }> | undefined,
  fallbackTax: number,
) {
  const matchedTax = deductions?.find((line) => /\bpayroll\s*tax\b/i.test(line.label));
  if (matchedTax) return matchedTax.amount;

  const genericTax = deductions?.find((line) => /\btax\b/i.test(line.label));
  return genericTax?.amount ?? fallbackTax;
}

function getPayslipHourMetrics(
  payslip:
    | {
        scheduledMinutes?: number | null;
        completedMinutes?: number | null;
        extraMinutes?: number | null;
        shortMinutes?: number | null;
      }
    | null
    | undefined,
) {
  return {
    scheduledMinutes: Math.max(0, Number(payslip?.scheduledMinutes ?? 0)),
    completedMinutes: Math.max(0, Number(payslip?.completedMinutes ?? 0)),
    extraMinutes: Math.max(0, Number(payslip?.extraMinutes ?? 0)),
    shortMinutes: Math.max(0, Number(payslip?.shortMinutes ?? 0)),
  };
}

export function MySalaryPage() {
  const { data: me } = useGetMe();
  const employeeId = me?.employeeId ?? 0;

  const { data: emp, isLoading: empLoading } = useGetEmployee(employeeId, {
    query: {
      queryKey: getGetEmployeeQueryKey(employeeId),
      enabled: employeeId > 0,
    },
  });
  const { data: components } = useListSalaryComponents(employeeId, {
    query: {
      queryKey: getListSalaryComponentsQueryKey(employeeId),
      enabled: employeeId > 0,
    },
  });
  const { data: loans } = useGetMyLoans({
    query: {
      queryKey: getGetMyLoansQueryKey(),
      enabled: employeeId > 0,
    },
  });
  const { data: eligibility } = useGetMyLoanEligibility({
    query: {
      queryKey: getGetMyLoanEligibilityQueryKey(),
      enabled: employeeId > 0,
    },
  });
  const { data: payslips } = useGetMyPayslips({
    query: { queryKey: getGetMyPayslipsQueryKey(), enabled: employeeId > 0 },
  });
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), enabled: employeeId > 0 },
  });

  if (empLoading || !emp) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const visibleComponents = useMemo(
    () => (components ?? []).filter((component) => !isManualTaxComponent(component)),
    [components],
  );
  const defaultAllowanceRows = getDefaultAllowanceBreakdown(emp.allowances ?? 0);
  const earnings = useMemo(
    () => [...defaultAllowanceRows, ...visibleComponents.filter((c) => !c.isDeduction)],
    [defaultAllowanceRows, visibleComponents],
  );
  const deductions = useMemo(
    () => visibleComponents.filter((c) => c.isDeduction),
    [visibleComponents],
  );
  const latestPayslip = payslips?.[0];
  const defaultAllowances = emp.allowances ?? 0;
  const totalSalary = emp.basicSalary + defaultAllowances;
  const effectiveProvidentFundPercent =
    emp.providentFundPercent ?? Number(settings?.defaultProvidentFundPercent ?? 0);
  const salaryPreview = computeSalaryStructurePreview({
    basicSalary: emp.basicSalary,
    defaultAllowances,
    components: visibleComponents,
    providentFundPercent: effectiveProvidentFundPercent,
    month: currentMonth,
    year: currentYear,
  });
  const latestPayrollTax = getDisplayedPayrollTax(
    latestPayslip?.salaryBreakdown?.deductions,
    salaryPreview.tax,
  );
  const currentProjectedTax = salaryPreview.tax;
  const latestLatePenalty =
    latestPayslip && latestPayslip.totalWorkingDays > 0
      ? ((latestPayslip.basicSalary / latestPayslip.totalWorkingDays) *
          (latestPayslip.lateAbsenceDays ?? 0))
      : 0;
  const latestPayslipHours = getPayslipHourMetrics(latestPayslip as any);

  const sumComponents = (rows: typeof earnings) => {
    let fixed = 0;
    let percent = 0;
    for (const r of rows) {
      if (r.valueType === "fixed") fixed += r.value;
      else percent += r.value;
    }
    return { fixed, percent };
  };

  const earnSum = useMemo(() => sumComponents(earnings), [earnings]);
  const dedSum = useMemo(() => sumComponents(deductions), [deductions]);

  const activeLoans = useMemo(
    () => (loans ?? []).filter((l) => l.status === "active"),
    [loans],
  );
  const closedLoans = useMemo(
    () => (loans ?? []).filter((l) => l.status !== "active"),
    [loans],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Salary"
        description="Your current salary structure, active loans and eligibility for new loans."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Total salary"
          value={formatCurrency(totalSalary)}
        />
        <StatCard
          icon={<Wallet className="h-4 w-4" />}
          label="Basic salary"
          value={formatCurrency(emp.basicSalary)}
        />
        <StatCard
          icon={<Coins className="h-4 w-4" />}
          label="Allowances (default)"
          value={formatCurrency(emp.allowances ?? 0)}
        />
        <StatCard
          icon={<Receipt className="h-4 w-4" />}
          label="PF deduction"
          value={
            effectiveProvidentFundPercent > 0
              ? `${effectiveProvidentFundPercent}% of basic`
              : "—"
          }
        />
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="Tax"
          value={formatCurrency(latestPayslip ? latestPayrollTax : currentProjectedTax)}
        />
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <p className="text-sm font-semibold">Salary components</p>
          <p className="text-xs text-muted-foreground">
            Default salary components are shown below.
          </p>
        </div>
        <ComponentTable
          title="Earnings"
          rows={earnings}
          totalsLabel="Total earnings"
          totals={earnSum}
        />
        <ComponentTable
          title="Deductions"
          rows={deductions}
          totalsLabel="Total deductions"
          totals={dedSum}
        />
        {!latestPayslip ? (
          <div className="border-t border-border px-4 py-8 text-center text-sm text-muted-foreground">
            Payroll breakdown will appear here after HR/Admin generates your payslip.
          </div>
        ) : (
          <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
            <PayrollPreviewCard
              label="Home rent"
              value={formatCurrency(defaultAllowanceRows[0]?.value ?? 0)}
            />
            <PayrollPreviewCard
              label="Utility bills"
              value={formatCurrency(defaultAllowanceRows[1]?.value ?? 0)}
            />
            <PayrollPreviewCard
              label="Payroll tax"
              value={formatCurrency(latestPayrollTax)}
              tone="down"
            />
            <PayrollPreviewCard
              label="PF deduction"
              value={formatCurrency(
                (effectiveProvidentFundPercent / 100) * emp.basicSalary,
              )}
              tone="down"
            />
            <PayrollPreviewCard
              label="Late penalty"
              value={formatCurrency(latestLatePenalty)}
              hint={`${latestPayslip.lateAbsenceDays ?? 0} penalty day(s)`}
              tone="down"
            />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <p className="text-sm font-semibold">Latest salary snapshot</p>
          <p className="text-xs text-muted-foreground">
            Latest generated payslip from payroll.
          </p>
        </div>
        {!latestPayslip ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No payslip generated yet.
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Landmark className="h-4 w-4" />}
                label="Period"
                value={formatMonth(latestPayslip.month, latestPayslip.year)}
              />
              <StatCard
                icon={<Receipt className="h-4 w-4" />}
                label="Tax"
                value={formatCurrency(latestPayrollTax)}
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Total deductions"
                value={formatCurrency(
                  latestPayslip.otherDeductions + latestPayslip.loanDeduction,
                )}
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Net salary"
                value={formatCurrency(latestPayslip.netSalary)}
              />
            </div>
            <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Landmark className="h-4 w-4" />}
                label="Hours required"
                value={formatDuration(latestPayslipHours.scheduledMinutes)}
              />
              <StatCard
                icon={<Landmark className="h-4 w-4" />}
                label="Hours completed"
                value={formatDuration(latestPayslipHours.completedMinutes)}
              />
              <StatCard
                icon={<Coins className="h-4 w-4" />}
                label="Extra hours"
                value={formatDuration(latestPayslipHours.extraMinutes)}
              />
              <StatCard
                icon={<AlertCircle className="h-4 w-4" />}
                label="Less hours"
                value={formatDuration(latestPayslipHours.shortMinutes)}
              />
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <p className="text-sm font-semibold">Loans</p>
            <p className="text-xs text-muted-foreground">
              Active loans are auto-deducted from your monthly payslip.
            </p>
          </div>
          {eligibility && (
            <div className="hidden text-right sm:block">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Loan limit
              </p>
              <p className="text-sm font-semibold">
                {eligibility.eligible
                  ? formatCurrency(eligibility.maxAmount)
                  : "Not eligible"}
              </p>
              {!eligibility.eligible && eligibility.reason && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amber-600">
                  <AlertCircle className="h-3 w-3" /> {eligibility.reason}
                </p>
              )}
            </div>
          )}
        </div>
        {(loans ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No loans on record.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Principal</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...activeLoans, ...closedLoans].map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">
                    {formatMonth(loan.startMonth, loan.startYear)}
                  </TableCell>
                  <TableCell>{formatCurrency(loan.principalAmount)}</TableCell>
                  <TableCell>
                    {formatCurrency(loan.monthlyInstallment)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      × {loan.monthsToRepay}
                    </span>
                  </TableCell>
                  <TableCell>{formatCurrency(loan.totalPaid)}</TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(loan.remainingBalance)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={loan.status === "active" ? "default" : "secondary"}
                    >
                      {loan.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function PayrollPreviewCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "down";
}) {
  const toneClass = tone === "down" ? "text-rose-600" : "text-foreground";

  return (
    <div className="flex min-h-[148px] flex-col rounded-xl border border-border bg-background/40 p-4">
      <p className="min-h-[2.75rem] text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-auto">
        <p className={`text-lg font-semibold ${toneClass}`}>{value}</p>
        {hint ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ComponentTable({
  title,
  rows,
  totalsLabel,
  totals,
}: {
  title: string;
  rows: Array<{
    id: number;
    label: string;
    kind: string;
    valueType: string;
    value: number;
  }>;
  totalsLabel: string;
  totals: { fixed: number; percent: number };
}) {
  return (
    <div>
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-4 text-sm text-muted-foreground">
          None configured.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="capitalize">
                    {r.kind}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.valueType === "percentage"
                    ? `${r.value}%`
                    : formatCurrency(r.value)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30">
              <TableCell className="font-semibold" colSpan={2}>
                {totalsLabel}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {totals.fixed > 0 ? formatCurrency(totals.fixed) : "—"}
                {totals.percent > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    + {totals.percent.toFixed(1)}%
                  </span>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
