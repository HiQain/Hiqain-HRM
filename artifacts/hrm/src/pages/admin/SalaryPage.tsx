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
  useGetSettings,
  useGeneratePayslip,
  useCreateSalaryComponent,
  useDeleteSalaryComponent,
  getGetEmployeeLateRecordsQueryKey,
  getGetEmployeePayslipsQueryKey,
  getGetEmployeeQueryKey,
  getListSalaryComponentsQueryKey,
  getGetEmployeeLoansQueryKey,
  getGetSettingsQueryKey,
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
  Trash2,
  Wand2,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCurrency, formatDate, formatDuration, formatMonth } from "@/lib/utils";
import {
  computeSalaryStructurePreview,
  getDefaultAllowanceBreakdown,
  resolveHistoricalCompensation,
  isManualTaxComponent,
  isProvidentFundApplicableForPeriod,
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

function maskSensitiveValue(value: string, visible: boolean) {
  return visible ? value : "••••••";
}

export function AdminSalaryPage() {
  const { data: employees } = useListEmployees();
  const now = new Date();
  const [showAmounts, setShowAmounts] = useState(false);
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
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const qc = useQueryClient();
  const setExcused = useSetAttendanceExcused();
  const generate = useGeneratePayslip();

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

  const visibleComponents = useMemo(
    () => (components ?? []).filter((component) => !isManualTaxComponent(component)),
    [components],
  );
  const filteredLateRecords = useMemo(() => {
    const weeklyOffDays = settings?.weeklyOffDays ?? [0, 6];
    const holidaySet = new Set(
      (settings?.publicHolidays ?? []).map((holiday) => holiday.date),
    );
    return (lateRecords ?? []).filter((record) => {
      const date = new Date(`${record.date}T00:00:00`);
      return !weeklyOffDays.includes(date.getDay()) && !holidaySet.has(record.date);
    });
  }, [lateRecords, settings?.publicHolidays, settings?.weeklyOffDays]);

  const totalLates = filteredLateRecords.length;
  const excusedLates = useMemo(
    () => filteredLateRecords.filter((r) => r.excused).length,
    [filteredLateRecords],
  );
  const countedLates = totalLates - excusedLates;
  const defaultAllowances = emp?.allowances ?? 0;
  const effectiveCompensation = resolveHistoricalCompensation({
    currentBasicSalary: emp?.basicSalary ?? 0,
    currentAllowances: defaultAllowances,
    incrementEvents: (emp?.salaryEvents ?? []).filter((event) => event.type === "increment"),
    month,
    year,
    basicSalaryPercent: settings?.basicSalaryPercent ?? 50,
    allowancePercent: settings?.allowancePercent ?? 50,
  });
  const defaultAllowanceRows = getDefaultAllowanceBreakdown(
    effectiveCompensation.defaultAllowances,
  );
  const earnings = useMemo(
    () => [...defaultAllowanceRows, ...visibleComponents.filter((c) => !c.isDeduction)],
    [defaultAllowanceRows, visibleComponents],
  );
  const deductions = useMemo(
    () => visibleComponents.filter((c) => c.isDeduction),
    [visibleComponents],
  );

  const activeLoans = useMemo(
    () => (loans ?? []).filter((l) => l.status === "active"),
    [loans],
  );
  const closedLoans = useMemo(
    () => (loans ?? []).filter((l) => l.status !== "active"),
    [loans],
  );

  const monthPayslip = useMemo(
    () => (payslips ?? []).find((p) => p.month === month && p.year === year),
    [month, payslips, year],
  );
  const isPastPeriod =
    year < now.getFullYear() ||
    (year === now.getFullYear() && month < now.getMonth() + 1);
  const displayedBasicSalary =
    monthPayslip?.basicSalary ?? effectiveCompensation.basicSalary;
  const displayedDefaultAllowances =
    monthPayslip?.allowances ?? effectiveCompensation.defaultAllowances;
  const totalSalary = displayedBasicSalary + displayedDefaultAllowances;
  const providentFundApplicable = isProvidentFundApplicableForPeriod(
    emp?.probationEndDate,
    month,
    year,
  );
  const effectiveProvidentFundPercent =
    providentFundApplicable
      ? emp?.providentFundPercent ?? Number(settings?.defaultProvidentFundPercent ?? 0)
      : 0;
  const salaryPreview = computeSalaryStructurePreview({
    basicSalary: displayedBasicSalary,
    defaultAllowances: displayedDefaultAllowances,
    components: visibleComponents,
    providentFundPercent: effectiveProvidentFundPercent,
    month,
    year,
    useDesignationFixedOverride: !isPastPeriod,
  });
  const generatedPayrollTax = getDisplayedPayrollTax(
    monthPayslip?.salaryBreakdown?.deductions,
    salaryPreview.tax,
  );
  const currentTax = monthPayslip
    ? generatedPayrollTax
    : salaryPreview.tax;
  const currentPerDaySalary = totalSalary / 30;
  const monthPayslipLatePenalty =
    monthPayslip
      ? (((monthPayslip.basicSalary + monthPayslip.allowances) / 30) *
        (monthPayslip.lateAbsenceDays ?? 0))
      : 0;
  const generatedPerDaySalary = monthPayslip
    ? (monthPayslip.basicSalary + monthPayslip.allowances) / 30
    : currentPerDaySalary;
  const monthPayslipHours = getPayslipHourMetrics(monthPayslip as any);
  const isFutureOrCurrent =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1);

  const onGeneratePayroll = () => {
    if (!enabled || isFutureOrCurrent) return;
    generate.mutate(
      { data: { employeeId: id, month, year } },
      {
        onSuccess: () => {
          toast.success(`Payroll generated for ${formatMonth(month, year)}`);
          qc.invalidateQueries({ queryKey: getGetEmployeePayslipsQueryKey(id) });
        },
        onError: () => toast.error("Could not generate payroll"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Salary"
        description="Select an employee to review their salary structure, deductions, late count, loans, and payroll history. You can excuse late marks here before generating the payslip."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAmounts((current) => !current)}
          >
            {showAmounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showAmounts ? "Hide amounts" : "Show amounts"}
          </Button>
        }
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Total salary"
                value={maskSensitiveValue(formatCurrency(totalSalary), showAmounts)}
              />
              <StatCard
                icon={<Wallet className="h-4 w-4" />}
                label="Basic salary"
                value={maskSensitiveValue(formatCurrency(displayedBasicSalary), showAmounts)}
              />
              <StatCard
                icon={<Coins className="h-4 w-4" />}
                label="Default allowances"
                value={maskSensitiveValue(formatCurrency(displayedDefaultAllowances), showAmounts)}
              />
              <StatCard
                icon={<Receipt className="h-4 w-4" />}
                label="PF deduction"
                value={
                  effectiveProvidentFundPercent > 0
                    ? maskSensitiveValue(`${effectiveProvidentFundPercent}% of basic`, showAmounts)
                    : "After probation"
                }
              />
              <StatCard
                icon={<Landmark className="h-4 w-4" />}
                label="Tax"
                value={maskSensitiveValue(formatCurrency(currentTax), showAmounts)}
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
                  Excused late marks are ignored by payroll and do not count
                  toward the late-to-absence penalty.
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
                  {filteredLateRecords.map((r) => (
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

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-4">
                <p className="text-sm font-semibold">Salary components</p>
                <p className="text-xs text-muted-foreground">
                  Default salary components are shown below.
                </p>
              </div>
              <ComponentTable title="Earnings" rows={earnings} showAmounts={showAmounts} />
              <ComponentTable title="Deductions" rows={deductions} showAmounts={showAmounts} />
              <div className="border-t border-border px-4 py-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MoneySummaryCard
                    label="Home rent"
                    value={maskSensitiveValue(formatCurrency(defaultAllowanceRows[0]?.value ?? 0), showAmounts)}
                  />
                  <MoneySummaryCard
                    label="Utility bills"
                    value={maskSensitiveValue(formatCurrency(defaultAllowanceRows[1]?.value ?? 0), showAmounts)}
                  />
                  <MoneySummaryCard
                    label="Payroll tax"
                    value={maskSensitiveValue(formatCurrency(currentTax), showAmounts)}
                    tone="down"
                  />
                  <MoneySummaryCard
                    label="PF deduction"
                    value={maskSensitiveValue(
                      formatCurrency((effectiveProvidentFundPercent / 100) * displayedBasicSalary),
                      showAmounts,
                    )}
                    tone="down"
                  />
                </div>
              </div>
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
                          {maskSensitiveValue(formatCurrency(loan.principalAmount), showAmounts)}
                        </TableCell>
                        <TableCell>
                          {maskSensitiveValue(formatCurrency(loan.monthlyInstallment), showAmounts)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            × {loan.monthsToRepay}
                          </span>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {maskSensitiveValue(formatCurrency(loan.remainingBalance), showAmounts)}
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
                  Once a payslip is generated, the payroll totals for that month are locked to that record.
                </p>
              </div>
              {monthPayslip && (
                <Badge variant="outline">
                  Generated {formatDate(monthPayslip.generatedAt)}
                </Badge>
              )}
            </div>
            <div className="border-b border-border p-4">
              <div className="flex items-end">
                <Button
                  onClick={onGeneratePayroll}
                  disabled={!enabled || generate.isPending || isFutureOrCurrent}
                  className="w-full md:w-auto"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  {generate.isPending ? "Generating..." : "Generate payroll"}
                </Button>
              </div>
            </div>
            {!monthPayslip ? (
              <div className="space-y-2 py-10 text-center text-sm text-muted-foreground">
                <p>No payslip generated yet for this month.</p>
                {isFutureOrCurrent && (
                  <p className="text-amber-600">
                    Payroll can only be generated for completed past months.
                  </p>
                )}
              </div>
            ) : (
              <>
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <PayrollStat
                  label="Working days"
                  value={String(monthPayslip.totalWorkingDays)}
                  hint={`${monthPayslip.presentDays} present · ${monthPayslip.absentDays} absent`}
                />
                <PayrollStat
                  label="Per day salary"
                  value={maskSensitiveValue(formatCurrency(generatedPerDaySalary), showAmounts)}
                  hint="Calculated on a 30-day month"
                />
                <PayrollStat
                  label="Late penalty days"
                  value={String(monthPayslip.lateAbsenceDays ?? 0)}
                  hint={`${monthPayslip.lateCount} lates recorded`}
                  subvalue={maskSensitiveValue(formatCurrency(monthPayslipLatePenalty), showAmounts)}
                  tone={(monthPayslip.lateAbsenceDays ?? 0) > 0 ? "down" : undefined}
                />
                <PayrollStat
                  label="Tax"
                  value={maskSensitiveValue(formatCurrency(currentTax), showAmounts)}
                  tone="down"
                />
                <PayrollStat
                  label="Total deductions"
                  value={maskSensitiveValue(
                    formatCurrency(
                      Number(monthPayslip.otherDeductions) +
                      Number(monthPayslip.loanDeduction),
                    ),
                    showAmounts,
                  )}
                  hint={`Loan ${maskSensitiveValue(formatCurrency(monthPayslip.loanDeduction), showAmounts)}`}
                  tone="down"
                />
                <PayrollStat
                  label="Net salary"
                  value={maskSensitiveValue(formatCurrency(monthPayslip.netSalary), showAmounts)}
                  hint={`Bonus ${maskSensitiveValue(formatCurrency(monthPayslip.bonus), showAmounts)}`}
                  tone="up"
                />
              </div>
              <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
                <PayrollStat
                  label="Hours required"
                  value={formatDuration(monthPayslipHours.scheduledMinutes)}
                />
                <PayrollStat
                  label="Hours completed"
                  value={formatDuration(monthPayslipHours.completedMinutes)}
                />
                <PayrollStat
                  label="Extra hours"
                  value={formatDuration(monthPayslipHours.extraMinutes)}
                  tone={monthPayslipHours.extraMinutes > 0 ? "up" : undefined}
                />
                <PayrollStat
                  label="Less hours"
                  value={formatDuration(monthPayslipHours.shortMinutes)}
                  tone={monthPayslipHours.shortMinutes > 0 ? "down" : undefined}
                />
              </div>
              </>
            )}
          </section>

            <ManageSalaryComponentsCard
              employeeId={id}
              defaultAllowanceRows={defaultAllowanceRows}
              showAmounts={showAmounts}
            />

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
                    <TableHead>Hours</TableHead>
                    <TableHead>Extra / Less</TableHead>
                    <TableHead className="text-right">Loan</TableHead>
                    <TableHead className="text-right">Other ded.</TableHead>
                    <TableHead className="text-right">Net salary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payslips ?? []).map((p) => {
                    const hourMetrics = getPayslipHourMetrics(p as any);
                    return (
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
                        <TableCell>
                          {formatDuration(hourMetrics.completedMinutes)} /{" "}
                          {formatDuration(hourMetrics.scheduledMinutes)}
                        </TableCell>
                        <TableCell>
                          {hourMetrics.extraMinutes > 0
                            ? `+${formatDuration(hourMetrics.extraMinutes)}`
                            : hourMetrics.shortMinutes > 0
                              ? `-${formatDuration(hourMetrics.shortMinutes)}`
                              : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {maskSensitiveValue(formatCurrency(p.loanDeduction), showAmounts)}
                        </TableCell>
                        <TableCell className="text-right">
                          {maskSensitiveValue(formatCurrency(p.otherDeductions), showAmounts)}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {maskSensitiveValue(formatCurrency(p.netSalary), showAmounts)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ManageSalaryComponentsCard({
  employeeId,
  defaultAllowanceRows,
  showAmounts,
}: {
  employeeId: number;
  defaultAllowanceRows: Array<{
    id: number;
    label: string;
    kind: string;
    valueType: string;
    percentageBase?: string;
    value: number;
    isDeduction?: boolean;
    isTaxable?: boolean;
  }>;
  showAmounts: boolean;
}) {
  const qc = useQueryClient();
  const { data: components } = useListSalaryComponents(employeeId, {
    query: {
      queryKey: getListSalaryComponentsQueryKey(employeeId),
      enabled: employeeId > 0,
    },
  });
  const create = useCreateSalaryComponent();
  const remove = useDeleteSalaryComponent();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<
    "commission" | "allowance" | "provident_fund" | "other" | "deduction"
  >("allowance");
  const [valueType, setValueType] = useState<"fixed" | "percentage">("fixed");
  const [value, setValue] = useState(0);
  const [percentageOfValue, setPercentageOfValue] = useState(0);
  const [percentageRate, setPercentageRate] = useState(0);
  const [pendingTaxDecision, setPendingTaxDecision] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListSalaryComponentsQueryKey(employeeId) });

  const resetForm = () => {
    setLabel("");
    setKind("allowance");
    setValueType("fixed");
    setValue(0);
    setPercentageOfValue(0);
    setPercentageRate(0);
    setPendingTaxDecision(false);
  };

  const isDeduction = kind === "deduction";
  const resolvedAmount =
    valueType === "percentage"
      ? Math.round(((percentageOfValue * percentageRate) / 100) * 100) / 100
      : value;

  const createComponent = (isTaxable: boolean) => {
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }

    create.mutate(
      {
        id: employeeId,
        data: {
          label: label.trim(),
          kind: kind === "deduction" ? "other" : kind,
          valueType: "fixed",
          value: resolvedAmount,
          isDeduction,
          isTaxable,
        },
      },
      {
        onSuccess: () => {
          toast.success("Component added");
          void invalidate();
          resetForm();
        },
        onError: () => toast.error("Could not add component"),
      },
    );
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    if (valueType === "percentage" && (percentageOfValue <= 0 || percentageRate <= 0)) {
      toast.error("Enter both the amount and percentage value");
      return;
    }

    if (!isDeduction && (kind === "allowance" || kind === "commission")) {
      setPendingTaxDecision(true);
      return;
    }

    createComponent(false);
  };
  const managedRows = [
    ...defaultAllowanceRows,
    ...((components ?? []) as Array<NonNullable<typeof components>[number]>),
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Manage salary components</p>
          <p className="text-xs text-muted-foreground">
            Default salary components are listed below. You can still add extra earnings or deductions here.
          </p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-4 grid gap-3 lg:grid-cols-12">
        <div className="space-y-1.5 lg:col-span-4">
          <Label className="text-xs">Label</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
          />
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label className="text-xs">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="allowance">Allowance</SelectItem>
              <SelectItem value="commission">Bonus / Commission</SelectItem>
              <SelectItem value="deduction">Deduction</SelectItem>
              <SelectItem value="provident_fund">Provident Fund</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 lg:col-span-2">
          <Label className="text-xs">Mode</Label>
          <Select
            value={valueType}
            onValueChange={(v) => {
              const next = v as typeof valueType;
              setValueType(next);
              if (next === "fixed") {
                setPercentageOfValue(0);
                setPercentageRate(0);
              } else {
                setValue(0);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">Fixed (PKR)</SelectItem>
              <SelectItem value="percentage">Percentage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {valueType === "percentage" ? (
          <>
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">% Of Value</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={percentageOfValue}
                onChange={(e) => setPercentageOfValue(Number(e.target.value))}
                placeholder="% of value"
              />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs">Percentage %</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={percentageRate}
                onChange={(e) => setPercentageRate(Number(e.target.value))}
                placeholder="Percentage %"
              />
            </div>
          </>
        ) : (
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-xs">Value</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
        )}
        {valueType === "percentage" && (
          <div className="lg:col-span-12 text-xs text-muted-foreground">
            This will add {maskSensitiveValue(formatCurrency(resolvedAmount), showAmounts)} to salary.
          </div>
        )}
        <div className="lg:col-span-12">
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add component"}
          </Button>
        </div>
      </form>

      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {managedRows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No components added yet.
          </div>
        ) : (
          managedRows.map((component) => (
            <div
              key={component.id}
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {component.label}
                  {isManualTaxComponent(component) && (
                    <span className="ml-2 text-xs text-amber-600">
                      legacy manual tax
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {humanizeSalaryKind(component.kind)} · {component.valueType} ·{" "}
                  {component.isDeduction ? "deduction" : "earning"}
                  {component.valueType === "percentage"
                    ? " · percentage amount"
                    : ""}
                  {!component.isDeduction && component.isTaxable === false
                    ? " · non-taxable"
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">
                  {maskSensitiveValue(
                    component.valueType === "percentage"
                      ? `${component.value}%`
                      : formatCurrency(component.value),
                    showAmounts,
                  )}
                </span>
                {component.id > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-rose-600"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { id: employeeId, componentId: component.id },
                        {
                          onSuccess: () => {
                            toast.success("Component removed");
                            void invalidate();
                          },
                          onError: () => toast.error("Could not remove component"),
                        },
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={pendingTaxDecision} onOpenChange={setPendingTaxDecision}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Count this in payroll tax?</DialogTitle>
            <DialogDescription>
              If this {kind === "commission" ? "commission" : "allowance"} is counted in
              tax, payroll tax will be calculated on the employee&apos;s updated taxable
              salary. If not, it will be added as a non-taxable extra amount.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => {
                setPendingTaxDecision(false);
                createComponent(false);
              }}
            >
              Do not count in tax
            </Button>
            <Button
              type="button"
              disabled={create.isPending}
              onClick={() => {
                setPendingTaxDecision(false);
                createComponent(true);
              }}
            >
              Count in tax
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </section>
  );
}

function humanizeSalaryKind(kind: string) {
  if (kind === "commission") return "bonus / commission";
  if (kind === "provident_fund") return "provident fund";
  if (kind === "other") return "other";
  return kind.replace("_", " ");
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
  subvalue,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  subvalue?: string;
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
    <div className="min-h-[150px] rounded-xl border border-border bg-background/40 px-5 py-5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-3 flex items-center gap-2 text-[1.8rem] font-semibold leading-none ${toneClass}`}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </p>
      {subvalue && (
        <p className={`mt-2 text-sm font-semibold ${toneClass}`}>{subvalue}</p>
      )}
      {hint && (
        <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function MoneySummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const toneClass =
    tone === "down"
      ? "text-rose-600"
      : tone === "up"
        ? "text-emerald-600"
        : "text-foreground";
  const parts = value.replace(/\s+/g, " ").trim().split(" ");
  const currency = parts[0] ?? "PKR";
  const amount = parts.slice(1).join(" ") || value;

  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-background to-muted/20 px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label === "Home rent" ? <>HOME<br />RENT</> : label}
      </p>
      <div className={`mt-6 overflow-hidden ${toneClass}`}>
        <p className="text-sm font-semibold leading-none opacity-90">{currency}</p>
        <p className="mt-2 whitespace-nowrap text-md font-bold leading-none tracking-[-0.03em]">
          {amount}
        </p>
      </div>
    </div>
  );
}

function ComponentTable({
  title,
  rows,
  showAmounts,
}: {
  title: string;
  rows: Array<{
    id: number;
    label: string;
    kind: string;
    valueType: string;
    value: number;
  }>;
  showAmounts: boolean;
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
                    {humanizeSalaryKind(r.kind)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {maskSensitiveValue(
                    r.valueType === "percentage" ? `${r.value}%` : formatCurrency(r.value),
                    showAmounts,
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
