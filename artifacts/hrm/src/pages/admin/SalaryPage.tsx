import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEmployees,
  useGetEmployee,
  useListSalaryComponents,
  useGetEmployeeLoans,
  useGetEmployeePayslips,
  useGetEmployeeLateRecords,
  useSetAttendanceExcused,
  getGetEmployeeLateRecordsQueryKey,
  getGetEmployeePayslipsQueryKey,
  getGetEmployeeQueryKey,
  getListSalaryComponentsQueryKey,
  getGetEmployeeLoansQueryKey,
} from "@workspace/api-client-react";
import {
  Wallet,
  Coins,
  Receipt,
  Landmark,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";

export function AdminSalaryPage() {
  const { data: employees } = useListEmployees();
  const now = new Date();
  const [empId, setEmpId] = useState<number | null>(null);
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const monthParam = useMemo(
    () => `${year}-${String(month).padStart(2, "0")}`,
    [year, month],
  );

  const enabled = empId != null && empId > 0;
  const id = empId ?? 0;

  const { data: emp, isLoading: empLoading } = useGetEmployee(id, {
    query: { queryKey: getGetEmployeeQueryKey(id), enabled },
  });
  const { data: components } = useListSalaryComponents(id, {
    query: { queryKey: getListSalaryComponentsQueryKey(id), enabled },
  });
  const { data: loans } = useGetEmployeeLoans(id, {
    query: { queryKey: getGetEmployeeLoansQueryKey(id), enabled },
  });
  const { data: payslips } = useGetEmployeePayslips(id, {
    query: { queryKey: getGetEmployeePayslipsQueryKey(id), enabled },
  });
  const { data: lateRecords } = useGetEmployeeLateRecords(
    id,
    { month: monthParam },
    {
      query: {
        queryKey: getGetEmployeeLateRecordsQueryKey(id, { month: monthParam }),
        enabled,
      },
    },
  );

  const qc = useQueryClient();
  const setExcused = useSetAttendanceExcused();

  const onToggleExcuse = (recordId: number, nextExcused: boolean) => {
    setExcused.mutate(
      { id: recordId, data: { excused: nextExcused } },
      {
        onSuccess: () => {
          toast.success(
            nextExcused
              ? "Late marked as excused"
              : "Late re-marked as counting",
          );
          qc.invalidateQueries({
            queryKey: getGetEmployeeLateRecordsQueryKey(id, {
              month: monthParam,
            }),
          });
        },
        onError: () => toast.error("Could not update record"),
      },
    );
  };

  const earnings = (components ?? []).filter((c) => !c.isDeduction);
  const deductions = (components ?? []).filter((c) => c.isDeduction);

  const activeLoans = (loans ?? []).filter((l) => l.status === "active");
  const closedLoans = (loans ?? []).filter((l) => l.status !== "active");

  const monthPayslip = (payslips ?? []).find(
    (p) => p.month === month && p.year === year,
  );

  const totalLates = lateRecords?.length ?? 0;
  const excusedLates = (lateRecords ?? []).filter((r) => r.excused).length;
  const countedLates = totalLates - excusedLates;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Salary"
        description="Pick a member to review their full salary picture: structure, deductions, late count, loans and payroll history. Adjust late marks here to forgive them before generating the payslip."
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Employee</Label>
          <Select
            value={empId ? String(empId) : ""}
            onValueChange={(v) => setEmpId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an employee..." />
            </SelectTrigger>
            <SelectContent>
              {(employees ?? []).map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name} · {e.position ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Month</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {formatMonth(i + 1, year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Year</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 py-16 text-center text-sm text-muted-foreground">
          Select an employee to view their salary breakdown.
        </div>
      ) : empLoading || !emp ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <EmployeeAvatar
                name={emp.name}
                url={emp.avatarUrl ?? null}
                size="lg"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{emp.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {emp.position ?? "—"} · {emp.department ?? "—"}
                </p>
              </div>
              <Badge variant="secondary" className="capitalize">
                {emp.positionType ?? "office"}
              </Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Basic salary"
                value={formatCurrency(emp.basicSalary)}
              />
              <StatCard
                icon={<Coins className="h-4 w-4" />}
                label="Default allowances"
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
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div>
                <p className="text-sm font-semibold">
                  Late attendance · {formatMonth(month, year)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Excused lates are forgiven by payroll and will not count
                  toward the late→absence penalty.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> Total {totalLates}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Excused {excusedLates}
                </Badge>
                <Badge
                  variant={countedLates > 0 ? "destructive" : "outline"}
                  className="gap-1"
                >
                  <TrendingDown className="h-3 w-3" /> Counts {countedLates}
                </Badge>
              </div>
            </div>
            {totalLates === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No late records this month.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lateRecords ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {formatDate(r.date)}
                      </TableCell>
                      <TableCell>
                        {r.excused ? (
                          <Badge
                            variant="secondary"
                            className="gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Excused
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="h-3 w-3" /> Counts as late
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.notes ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={r.excused ? "outline" : "default"}
                          size="sm"
                          disabled={setExcused.isPending}
                          onClick={() => onToggleExcuse(r.id, !r.excused)}
                        >
                          {r.excused ? "Un-excuse" : "Forgive late"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-4">
                <p className="text-sm font-semibold">Salary components</p>
                <p className="text-xs text-muted-foreground">
                  Configured by HR — these override the defaults above.
                </p>
              </div>
              <ComponentTable title="Earnings" rows={earnings} />
              <ComponentTable title="Deductions" rows={deductions} />
            </section>

            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-4">
                <p className="text-sm font-semibold">Loans</p>
                <p className="text-xs text-muted-foreground">
                  Active loans are auto-deducted from monthly payslips.
                </p>
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
                        <TableCell>
                          {formatCurrency(loan.principalAmount)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(loan.monthlyInstallment)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            × {loan.monthsToRepay}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatCurrency(loan.remainingBalance)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              loan.status === "active" ? "default" : "secondary"
                            }
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

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div>
                <p className="text-sm font-semibold">
                  Payroll for {formatMonth(month, year)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Generated payslip snapshot for the selected month.
                </p>
              </div>
              {monthPayslip && (
                <Badge variant="outline">
                  Generated {formatDate(monthPayslip.generatedAt)}
                </Badge>
              )}
            </div>
            {!monthPayslip ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No payslip generated yet for this month. Use the Payslips tab to
                generate one after adjusting late marks.
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <PayrollStat
                  label="Working days"
                  value={String(monthPayslip.totalWorkingDays)}
                  hint={`${monthPayslip.presentDays} present · ${monthPayslip.absentDays} absent`}
                />
                <PayrollStat
                  label="Late penalty days"
                  value={String(monthPayslip.lateAbsenceDays ?? 0)}
                  hint={`${monthPayslip.lateCount} lates recorded`}
                  tone={(monthPayslip.lateAbsenceDays ?? 0) > 0 ? "down" : undefined}
                />
                <PayrollStat
                  label="Total deductions"
                  value={formatCurrency(
                    Number(monthPayslip.otherDeductions) +
                      Number(monthPayslip.loanDeduction),
                  )}
                  hint={`Loan ${formatCurrency(monthPayslip.loanDeduction)}`}
                  tone="down"
                />
                <PayrollStat
                  label="Net salary"
                  value={formatCurrency(monthPayslip.netSalary)}
                  hint={`Bonus ${formatCurrency(monthPayslip.bonus)}`}
                  tone="up"
                />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-4">
              <p className="text-sm font-semibold">Payroll history</p>
              <p className="text-xs text-muted-foreground">
                All previously generated payslips for this employee.
              </p>
            </div>
            {(payslips ?? []).length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No payslips generated yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Present / Late</TableHead>
                    <TableHead>Late penalty</TableHead>
                    <TableHead className="text-right">Loan</TableHead>
                    <TableHead className="text-right">Other ded.</TableHead>
                    <TableHead className="text-right">Net salary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payslips ?? []).map((p) => (
                    <TableRow
                      key={p.id}
                      className={
                        p.month === month && p.year === year
                          ? "bg-muted/40"
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        {formatMonth(p.month, p.year)}
                      </TableCell>
                      <TableCell>
                        {p.presentDays} / {p.lateCount}
                      </TableCell>
                      <TableCell>{p.lateAbsenceDays} days</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(p.loanDeduction)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(p.otherDeductions)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(p.netSalary)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}
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
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function PayrollStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
}) {
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : null;
  const toneClass =
    tone === "up"
      ? "text-emerald-600"
      : tone === "down"
        ? "text-rose-600"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 flex items-center gap-1 text-base font-semibold ${toneClass}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ComponentTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    id: number;
    label: string;
    kind: string;
    valueType: string;
    value: number;
  }>;
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
          </TableBody>
        </Table>
      )}
    </div>
  );
}
