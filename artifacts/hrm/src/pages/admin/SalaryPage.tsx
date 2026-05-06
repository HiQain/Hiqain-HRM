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
import {
  computeSalaryStructurePreview,
  getDefaultAllowanceBreakdown,
  isManualTaxComponent,
} from "@/lib/salary";

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

  const visibleComponents = (components ?? []).filter(
    (component) => !isManualTaxComponent(component),
  );
  const defaultAllowanceRows = getDefaultAllowanceBreakdown(emp?.allowances ?? 0);
  const earnings = [
    ...defaultAllowanceRows,
    ...visibleComponents.filter((c) => !c.isDeduction),
  ];
  const deductions = visibleComponents.filter((c) => c.isDeduction);

  const activeLoans = (loans ?? []).filter((l) => l.status === "active");
  const closedLoans = (loans ?? []).filter((l) => l.status !== "active");

  const monthPayslip = (payslips ?? []).find(
    (p) => p.month === month && p.year === year,
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
  const excusedLates = filteredLateRecords.filter((r) => r.excused).length;
  const countedLates = totalLates - excusedLates;
  const defaultAllowances = emp?.allowances ?? 0;
  const totalSalary = (emp?.basicSalary ?? 0) + defaultAllowances;
  const salaryPreview = computeSalaryStructurePreview({
    basicSalary: emp?.basicSalary ?? 0,
    defaultAllowances,
    components: visibleComponents,
    providentFundPercent: emp?.providentFundPercent,
    month,
    year,
  });
  const generatedPayrollTax =
    monthPayslip?.salaryBreakdown?.deductions?.find((line) => line.label === "Payroll Tax")
      ?.amount ?? null;
  const currentTax = monthPayslip
    ? generatedPayrollTax ?? 0
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
                value={formatCurrency(totalSalary)}
              />
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
                label="Tax"
                value={formatCurrency(currentTax)}
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
              <ComponentTable title="Earnings" rows={earnings} />
              <ComponentTable title="Deductions" rows={deductions} />
              <div className="border-t border-border px-4 py-5">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MoneySummaryCard
                    label="Home rent"
                    value={formatCurrency(defaultAllowanceRows[0]?.value ?? 0)}
                  />
                  <MoneySummaryCard
                    label="Utility bills"
                    value={formatCurrency(defaultAllowanceRows[1]?.value ?? 0)}
                  />
                  <MoneySummaryCard
                    label="Payroll tax"
                    value={formatCurrency(currentTax)}
                    tone="down"
                  />
                  <MoneySummaryCard
                    label="PF deduction"
                    value={formatCurrency(
                      ((emp.providentFundPercent ?? 0) / 100) * emp.basicSalary,
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
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
                <PayrollStat
                  label="Working days"
                  value={String(monthPayslip.totalWorkingDays)}
                  hint={`${monthPayslip.presentDays} present · ${monthPayslip.absentDays} absent`}
                />
                <PayrollStat
                  label="Per day salary"
                  value={formatCurrency(generatedPerDaySalary)}
                  hint="Calculated on a 30-day month"
                />
                <PayrollStat
                  label="Late penalty days"
                  value={String(monthPayslip.lateAbsenceDays ?? 0)}
                  hint={`${monthPayslip.lateCount} lates recorded`}
                  subvalue={formatCurrency(monthPayslipLatePenalty)}
                  tone={(monthPayslip.lateAbsenceDays ?? 0) > 0 ? "down" : undefined}
                />
                <PayrollStat
                  label="Tax"
                  value={formatCurrency(currentTax)}
                  tone="down"
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

          <ManageSalaryComponentsCard
            employeeId={id}
            defaultAllowanceRows={defaultAllowanceRows}
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

function ManageSalaryComponentsCard({
  employeeId,
  defaultAllowanceRows,
}: {
  employeeId: number;
  defaultAllowanceRows: Array<{
    id: number;
    label: string;
    kind: string;
    valueType: string;
    value: number;
    isDeduction?: boolean;
    isTaxable?: boolean;
  }>;
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
    "commission" | "allowance" | "provident_fund" | "other"
  >("allowance");
  const [valueType, setValueType] = useState<"fixed" | "percentage">("fixed");
  const [value, setValue] = useState(0);
  const [isDeduction, setIsDeduction] = useState(false);
  const [pendingTaxDecision, setPendingTaxDecision] = useState(false);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListSalaryComponentsQueryKey(employeeId) });

  const resetForm = () => {
    setLabel("");
    setKind("allowance");
    setValueType("fixed");
    setValue(0);
    setIsDeduction(false);
    setPendingTaxDecision(false);
  };

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
          kind,
          valueType,
          value,
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

    if (!isDeduction && (kind === "allowance" || kind === "commission")) {
      setPendingTaxDecision(true);
      return;
    }

    createComponent(false);
  };
  const managedRows = [
    ...defaultAllowanceRows,
    ...((components ?? []).filter((component) => !component.isDeduction) as Array<
      NonNullable<typeof components>[number]
    >),
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold">Manage salary components</p>
        <p className="text-xs text-muted-foreground">
          Default salary components are listed below. You can still add extra earnings or deductions here.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-4 grid gap-3 lg:grid-cols-12">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          className="lg:col-span-4"
        />
        <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
          <SelectTrigger className="lg:col-span-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="allowance">Allowance</SelectItem>
            <SelectItem value="commission">Bonus / Commission</SelectItem>
            <SelectItem value="provident_fund">Provident Fund</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={valueType}
          onValueChange={(v) => setValueType(v as typeof valueType)}
        >
          <SelectTrigger className="lg:col-span-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">Fixed (PKR)</SelectItem>
            <SelectItem value="percentage">% of basic</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="lg:col-span-2"
        />
        <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground lg:col-span-1">
          <input
            type="checkbox"
            checked={isDeduction}
            onChange={(e) => setIsDeduction(e.target.checked)}
          />
          Mark as deduction
        </label>
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
                  {!component.isDeduction && component.isTaxable === false
                    ? " · non-taxable"
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">
                  {component.valueType === "percentage"
                    ? `${component.value}%`
                    : formatCurrency(component.value)}
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
                    {humanizeSalaryKind(r.kind)}
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
