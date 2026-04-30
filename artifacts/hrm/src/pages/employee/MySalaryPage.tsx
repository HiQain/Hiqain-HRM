import {
  useGetMe,
  useGetEmployee,
  useListSalaryComponents,
  useGetMyLoans,
  useGetMyLoanEligibility,
  getGetEmployeeQueryKey,
  getListSalaryComponentsQueryKey,
  getGetMyLoansQueryKey,
  getGetMyLoanEligibilityQueryKey,
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
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";

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

  if (empLoading || !emp) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const earnings = (components ?? []).filter((c) => !c.isDeduction);
  const deductions = (components ?? []).filter((c) => c.isDeduction);

  const sumComponents = (rows: typeof earnings) => {
    let fixed = 0;
    let percent = 0;
    for (const r of rows) {
      if (r.valueType === "fixed") fixed += r.value;
      else percent += r.value;
    }
    return { fixed, percent };
  };

  const earnSum = sumComponents(earnings);
  const dedSum = sumComponents(deductions);

  const activeLoans = (loans ?? []).filter((l) => l.status === "active");
  const closedLoans = (loans ?? []).filter((l) => l.status !== "active");

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Salary"
        description="Your current salary structure, active loans and eligibility for new loans."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            emp.providentFundPercent != null && emp.providentFundPercent > 0
              ? `${emp.providentFundPercent}% of basic`
              : "—"
          }
        />
        <StatCard
          icon={<Landmark className="h-4 w-4" />}
          label="Joined"
          value={formatDate(emp.joiningDate)}
        />
      </div>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <p className="text-sm font-semibold">Salary components</p>
          <p className="text-xs text-muted-foreground">
            Configured by HR — these override the defaults above.
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
