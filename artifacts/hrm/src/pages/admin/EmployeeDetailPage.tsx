import { type FormEvent, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetEmployee,
  useGetEmployeeJourney,
  useGetMe,
  useUpdateEmployee,
  useCreateSalaryEvent,
  useDeleteSalaryEvent,
  useUpdateSalaryEvent,
  useListGeneralRequests,
  useListSalaryComponents,
  useCreateSalaryComponent,
  useDeleteSalaryComponent,
  useGetEmployeeAttendance,
  useGetAttendanceCalendar,
  useGetEmployeePayslips,
  useGeneratePayslip,
  useGetEmployeeLoans,
  useGetSettings,
  getGetEmployeeQueryKey,
  getGetEmployeeJourneyQueryKey,
  getGetEmployeeAttendanceQueryKey,
  getGetAttendanceCalendarQueryKey,
  getGetEmployeePayslipsQueryKey,
  getGetSettingsQueryKey,
  getListEmployeesQueryKey,
  getListGeneralRequestsQueryKey,
  getListSalaryComponentsQueryKey,
  type AttendanceCalendarDay,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  GraduationCap,
  Briefcase,
  ShieldCheck,
  Pencil,
  Copy,
  Trash2,
  FileDown,
  Upload,
  FileText,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Plane,
  CalendarDays,
  CalendarRange,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { AttendanceRuleHint } from "@/components/AttendanceRuleHint";
import { StatCard } from "@/components/StatCard";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { DateField } from "@/components/DateField";
import { JourneyTimeline } from "@/components/JourneyTimeline";
import { StatusBadge } from "@/components/StatusBadge";
import { PayslipView } from "@/components/PayslipView";
import { ProvidentFundLedgerCard } from "@/components/ProvidentFundLedgerCard";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDuration,
  formatMonth,
  formatTime,
  ymdLocal,
} from "@/lib/utils";
import { getApiUrl } from "@/lib/api";
import {
  buildScheduledHoursTargets,
  normalizeAttendanceWorkedMinutes,
} from "@/lib/attendanceHours";
import { inferPercentageBaseAmount } from "@/lib/salary";
import { buildProvidentFundSummary } from "@/lib/providentFund";

const PRIMARY_PAYROLL_BANK = "Bank Al Habib";

function splitTotalSalary(totalSalary: number) {
  const safeTotal = Math.max(0, totalSalary);
  const basicSalary = Math.round(safeTotal / 2);
  const allowances = safeTotal - basicSalary;
  return { basicSalary, allowances };
}

function splitAllowanceBreakdown(allowances: number) {
  const safeAllowances = Math.max(0, allowances);
  const homeRent = Math.round(safeAllowances / 2);
  const utilityBills = safeAllowances - homeRent;
  return { homeRent, utilityBills };
}

function openEmployeeEditor(employeeId: number) {
  window.localStorage.setItem("hrm-edit-employee-id", String(employeeId));
  window.location.href = "/admin/employees";
}

export function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data: employee, isLoading } = useGetEmployee(id, {
    query: { queryKey: getGetEmployeeQueryKey(id), enabled: !!id },
  });
  const { data: journey } = useGetEmployeeJourney(id, {
    query: { queryKey: getGetEmployeeJourneyQueryKey(id), enabled: !!id },
  });

  if (isLoading || !employee) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  const probationActive =
    new Date(employee.probationEndDate) > new Date();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/employees"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to employees
      </Link>

      {/* Hero */}
      <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm sm:flex-row sm:items-center">
        <EmployeeAvatar
          name={employee.name}
          url={employee.avatarUrl ?? null}
          size="xl"
        />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {employee.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {employee.position ?? "Team member"}
            {employee.department && ` · ${employee.department}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
                employee.isActive === false
                  ? "bg-rose-50 text-rose-700"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {employee.isActive === false ? "Inactive" : "Active"}
            </span>
            <Badge icon={Briefcase}>
              Joined {formatDate(employee.joiningDate)}
            </Badge>
            <Badge icon={Calendar}>
              {Math.floor(employee.workDurationMonths / 12)}y{" "}
              {employee.workDurationMonths % 12}m at company
            </Badge>
            <Badge icon={ShieldCheck} tone={probationActive ? "warning" : "success"}>
              {probationActive
                ? `Probation until ${formatDate(employee.probationEndDate)}`
                : "Permanent"}
            </Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs sm:text-right">
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-muted-foreground">Basic salary</p>
            <p className="mt-0.5 text-base font-semibold">
              {formatCurrency(employee.basicSalary)}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-muted-foreground">Allowances</p>
            <p className="mt-0.5 text-base font-semibold">
              {formatCurrency(employee.allowances)}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="bg-card">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="journey">Journey</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="pf">Provident Fund</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-5">
          <ProfileTab employee={employee} />
        </TabsContent>
        <TabsContent value="journey" className="mt-5">
          <JourneyTimeline events={journey?.events ?? []} />
        </TabsContent>
        <TabsContent value="salary" className="mt-5">
          <SalaryTab id={id} events={employee.salaryEvents ?? []} />
        </TabsContent>
        <TabsContent value="pf" className="mt-5">
          <ProvidentFundTab id={id} employee={employee} />
        </TabsContent>
        <TabsContent value="attendance" className="mt-5">
          <AttendanceTab id={id} employee={employee} />
        </TabsContent>
        <TabsContent value="payslips" className="mt-5">
          <PayslipsTab id={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Badge({
  icon: Icon,
  children,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const tones = {
    default: "bg-muted text-foreground",
    warning: "bg-amber-50 text-amber-700",
    success: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${tones[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

function ProfileTab({ employee }: { employee: any }) {
  const totalSalary = Number(employee.basicSalary) + Number(employee.allowances);
  const allowanceBreakdown = useMemo(
    () => splitAllowanceBreakdown(Number(employee.allowances) || 0),
    [employee.allowances],
  );

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Profile overview</p>
          <p className="text-sm text-muted-foreground">
            This page is now view-only. Use the edit drawer to update details
            or deactivate the user.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => openEmployeeEditor(employee.id)}
          className="gap-2"
        >
          <Pencil className="h-4 w-4" />
          Edit employee
        </Button>
      </div>

      <ReadonlySection title="User details">
        <ReadonlyGrid>
          <ReadonlyField label="Employee code" value={employee.employeeCode} />
          <ReadonlyField label="Full name" value={employee.name} />
          <ReadonlyField
            label="Work email"
            value={employee.email}
            copyValue={employee.email}
            copyLabel="work email"
          />
          <ReadonlyField label="Account role" value={employee.role} />
          <ReadonlyField label="Personal email" value={employee.personalEmail} />
          <ReadonlyField label="Phone number" value={employee.phone} />
          <ReadonlyField label="Account status" value={employee.isActive === false ? "Inactive" : "Active"} />
          <ReadonlyField label="Position" value={employee.position} />
          <ReadonlyField label="Department" value={employee.department} />
          <ReadonlyField label="Marital status" value={employee.maritalStatus} />
          <ReadonlyField label="Wife name" value={employee.wifeName} />
          <ReadonlyField label="Kids" value={employee.kidsCount != null ? String(employee.kidsCount) : null} />
          <ReadonlyField
            label="Kids names"
            value={
              Array.isArray(employee.kidsNames) && employee.kidsNames.length
                ? employee.kidsNames.join(", ")
                : null
            }
            className="md:col-span-2"
          />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Work details">
        <ReadonlyGrid>
          <ReadonlyField label="Work location" value={employee.positionType === "remote" ? "Remote" : "Onsite"} />
          <ReadonlyField label="Joining date" value={formatDate(employee.joiningDate)} />
          <ReadonlyField label="Date of birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : null} />
          <ReadonlyField label="Probation (months)" value={String(employee.probationMonths ?? "—")} />
          <ReadonlyField label="Left date" value={employee.leftDate ? formatDate(employee.leftDate) : null} />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Schedule">
        <ReadonlyGrid columns="three">
          <ReadonlyField label="Grace period (min)" value={String(employee.gracePeriodMinutes ?? "—")} />
          <ReadonlyField label="Break (min)" value={String(employee.breakMinutes ?? "—")} />
          <ReadonlyField label="Office start" value={employee.officeStartTime} />
          <ReadonlyField label="Office end" value={employee.officeEndTime} />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Compensation">
        <ReadonlyGrid>
          <ReadonlyField label="Total salary (PKR)" value={formatCurrency(totalSalary)} />
          <ReadonlyField label="Basic salary (PKR)" value={formatCurrency(employee.basicSalary)} />
          <ReadonlyField label="Home rent (PKR)" value={formatCurrency(allowanceBreakdown.homeRent)} />
          <ReadonlyField label="Utility bills (PKR)" value={formatCurrency(allowanceBreakdown.utilityBills)} />
          <ReadonlyField label="Casual leave" value={String(employee.casualLeaveQuota ?? "—")} />
          <ReadonlyField label="Sick leave" value={String(employee.sickLeaveQuota ?? "—")} />
          <ReadonlyField label="Annual leave" value={String(employee.annualLeaveQuota ?? "—")} />
          <ReadonlyField
            label="Provident Fund (% of basic)"
            value={
              employee.providentFundPercent != null
                ? String(employee.providentFundPercent)
                : null
            }
          />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Medical allowance">
        <ReadonlyGrid>
          <ReadonlyField
            label="Medical status"
            value={employee.medicalEnabled ? "Enabled" : "Disabled"}
          />
          <ReadonlyField
            label="Yearly IPD allowance (PKR)"
            value={employee.medicalOverallLimit != null ? formatCurrency(employee.medicalOverallLimit) : null}
          />
          <ReadonlyField
            label="Per day limit (PKR)"
            value={employee.medicalDailyLimit != null ? formatCurrency(employee.medicalDailyLimit) : null}
          />
          <ReadonlyField
            label="Covered members"
            value={
              [
                employee.name,
                employee.wifeName,
                ...(Array.isArray(employee.kidsNames) ? employee.kidsNames : []),
              ]
                .filter(Boolean)
                .join(", ")
            }
            className="md:col-span-2"
          />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Primary bank details">
        <ReadonlyGrid>
          <ReadonlyField label="Account title" value={employee.primaryBankAccountTitle ?? employee.bankAccountTitle} />
          <ReadonlyField label="Account number" value={employee.primaryBankAccountNumber ?? employee.bankAccountNumber} />
          <ReadonlyField label="Bank name" value={employee.primaryBankName ?? employee.bankName ?? PRIMARY_PAYROLL_BANK} />
          <ReadonlyField label="IBAN" value={employee.primaryBankIban ?? employee.bankIban} />
          <ReadonlyField label="Branch code" value={employee.primaryBankBranchCode ?? employee.bankBranchCode} />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Secondary bank details">
        <ReadonlyGrid>
          <ReadonlyField label="Account title" value={employee.secondaryBankAccountTitle} />
          <ReadonlyField label="Account number" value={employee.secondaryBankAccountNumber} />
          <ReadonlyField label="Bank name" value={employee.secondaryBankName} />
          <ReadonlyField label="IBAN" value={employee.secondaryBankIban} />
          <ReadonlyField label="Branch code" value={employee.secondaryBankBranchCode} />
        </ReadonlyGrid>
      </ReadonlySection>

      <ReadonlySection title="Background">
        <ReadonlyGrid>
          <ReadonlyField label="CNIC" value={employee.cnic} />
          <ReadonlyField label="Emergency contact name" value={employee.emergencyContactName} />
          <ReadonlyField label="Emergency contact number" value={employee.emergencyContactNumber ?? employee.emergencyContact} />
          <ReadonlyField label="Relation" value={employee.emergencyContactRelation} />
          <ReadonlyField label="Last qualification" value={employee.lastQualification} />
          <ReadonlyField label="Previous company" value={employee.previousCompany} />
          <ReadonlyField label="Last pay (PKR)" value={employee.lastPay != null ? formatCurrency(employee.lastPay) : null} />
          <ReadonlyField label="Family members" value={employee.immediateFamily} className="md:col-span-2" multiline />
          <ReadonlyField label="Address" value={employee.address} className="md:col-span-2" multiline />
          <ReadonlyField label="Notes" value={employee.notes} className="md:col-span-2" multiline />
        </ReadonlyGrid>
        <div className="grid gap-3 md:grid-cols-2">
          <ReadonlyDocumentField label="Employment contract" url={employee.employmentContractUrl} name={employee.employmentContractName} />
          <ReadonlyDocumentField label="Qualification document" url={employee.qualificationDocumentUrl} name={employee.qualificationDocumentName} />
          <ReadonlyDocumentField label="Front CNIC" url={employee.cnicFrontDocumentUrl} name={employee.cnicFrontDocumentName} />
          <ReadonlyDocumentField label="Back CNIC" url={employee.cnicBackDocumentUrl} name={employee.cnicBackDocumentName} />
          <ReadonlyDocumentField label="Last 3 months payslip 1" url={employee.lastPayslipOneUrl} name={employee.lastPayslipOneName} />
          <ReadonlyDocumentField label="Last 3 months payslip 2" url={employee.lastPayslipTwoUrl} name={employee.lastPayslipTwoName} />
          <ReadonlyDocumentField label="Last 3 months payslip 3" url={employee.lastPayslipThreeUrl} name={employee.lastPayslipThreeName} />
        </div>
      </ReadonlySection>
    </div>
  );
}

function ReadonlySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-muted/20 p-4">
      <p className="mb-4 text-sm font-semibold text-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

function ReadonlyGrid({
  children,
  columns = "two",
}: {
  children: React.ReactNode;
  columns?: "two" | "three";
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === "three" ? "md:grid-cols-3" : "md:grid-cols-2",
      )}
    >
      {children}
    </div>
  );
}

function ReadonlyField({
  label,
  value,
  className,
  multiline = false,
  copyValue,
  copyLabel,
}: {
  label: string;
  value: string | number | null | undefined;
  className?: string;
  multiline?: boolean;
  copyValue?: string | null;
  copyLabel?: string;
}) {
  const normalizedCopyValue = copyValue?.trim() || "";
  const hasValue =
    value !== null && value !== undefined && String(value).trim().length > 0;

  const handleCopy = async () => {
    if (!normalizedCopyValue) return;

    try {
      await navigator.clipboard.writeText(normalizedCopyValue);
      toast.success(`${copyLabel ?? label} copied`);
    } catch {
      toast.error(`Could not copy ${copyLabel ?? label}`);
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      {normalizedCopyValue && !multiline ? (
        <InputGroup>
          <InputGroupInput readOnly value={hasValue ? String(value) : ""} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => void handleCopy()}
              aria-label={`Copy ${copyLabel ?? label}`}
              title={`Copy ${copyLabel ?? label}`}
            >
              <Copy className="h-3.5 w-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <div
          className={cn(
            "min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground",
            multiline && "min-h-20 whitespace-pre-wrap",
          )}
        >
          {hasValue ? value : "—"}
        </div>
      )}
    </div>
  );
}

function ReadonlyDocumentField({
  label,
  url,
  name,
}: {
  label: string;
  url?: string | null;
  name?: string | null;
}) {
  const fileName = name || "Attachment";
  const normalizedUrl = url ?? null;
  const isImage = normalizedUrl
    ? /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(normalizedUrl)
    : false;

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-foreground">{label}</Label>
      <div className="rounded-md border border-border bg-background p-3 text-sm">
        {normalizedUrl ? (
          <div className="space-y-3">
            {isImage ? (
              <a href={normalizedUrl} target="_blank" rel="noreferrer">
                <img
                  src={normalizedUrl}
                  alt={fileName}
                  className="h-40 w-full rounded-md border border-border object-cover"
                />
              </a>
            ) : (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                Attachment available
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-foreground">
                {fileName}
              </p>
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                Open
              </a>
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

function PayrollSnapshotCard({ id }: { id: number }) {
  const qc = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const monthYmd = `${year}-${String(month).padStart(2, "0")}`;
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const { data: attendance } = useGetEmployeeAttendance(
    id,
    { month: monthYmd },
    {
      query: {
        queryKey: getGetEmployeeAttendanceQueryKey(id, { month: monthYmd }),
      },
    },
  );
  const { data: payslips } = useGetEmployeePayslips(id, {
    query: { queryKey: getGetEmployeePayslipsQueryKey(id) },
  });
  const { data: loans } = useGetEmployeeLoans(id);
  const generate = useGeneratePayslip();

  const lateCount = useMemo(
    () =>
      (attendance ?? []).filter((r) => !r.excused && r.status === "late")
        .length,
    [attendance],
  );
  const grace = settings?.lateGraceCount ?? 2;
  const everyN = Math.max(1, settings?.lateAbsenceEvery ?? 3);
  const computedAbsenceDays = Math.floor(
    Math.max(0, lateCount - grace) / everyN,
  );

  const payslip = useMemo(
    () => (payslips ?? []).find((p) => p.month === month && p.year === year),
    [payslips, month, year],
  );
  const activeLoans = useMemo(
    () => (loans ?? []).filter((l) => l.status === "active"),
    [loans],
  );

  const onGenerate = () => {
    generate.mutate(
      {
        data: {
          employeeId: id,
          month,
          year,
        },
      },
      {
        onSuccess: async () => {
          toast.success(
            "Payslip generated for this month",
          );
          await qc.invalidateQueries({
            queryKey: getGetEmployeePayslipsQueryKey(id),
          });
        },
        onError: () => toast.error("Could not generate payslip"),
      },
    );
  };

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Payroll snapshot</p>
          <p className="text-xs text-muted-foreground">
            Live view of {monthLabel} — late marks, derived absences, loan
            installment, and current payslip totals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="h-8 w-[90px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SnapshotStat label="Late marks (this month)" value={lateCount} />
        <SnapshotStat
          label="Derived absence days"
          value={computedAbsenceDays}
          hint={`grace ${grace}, every ${everyN}`}
        />
        <SnapshotStat
          label="Active loan balance"
          value={
            activeLoans.length
              ? `Rs. ${activeLoans
                  .reduce((s, l) => s + Number(l.remainingBalance ?? 0), 0)
                  .toLocaleString()}`
              : "—"
          }
          hint={
            activeLoans.length
              ? `Installment Rs. ${activeLoans
                  .reduce((s, l) => s + Number(l.monthlyInstallment ?? 0), 0)
                  .toLocaleString()}/mo`
              : "no active loans"
          }
        />
        <SnapshotStat
          label="Total disbursement"
          value={
            payslip
              ? `Rs. ${Number(payslip.netSalary).toLocaleString()}`
              : "—"
          }
          hint={
            payslip
              ? `Net after deductions · Loan ded. Rs. ${Number(payslip.loanDeduction ?? 0).toLocaleString()}`
              : "not generated yet"
          }
        />
      </div>

      {payslip && (
        <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Late → absence days</p>
            <p className="text-sm font-semibold">
              {Number(payslip.lateAbsenceDays ?? payslip.latePenaltyDays ?? 0).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Absent days</p>
            <p className="text-sm font-semibold">{payslip.absentDays}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Other deductions</p>
            <p className="text-sm font-semibold">
              Rs. {Number(payslip.otherDeductions ?? 0).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Bonus</p>
            <p className="text-sm font-semibold">
              Rs. {Number(payslip.bonus ?? 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

    </div>
  );
}

function SnapshotStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProvidentFundTab({
  id,
  employee,
}: {
  id: number;
  employee: any;
}) {
  const { data: payslips } = useGetEmployeePayslips(id, {
    query: { queryKey: getGetEmployeePayslipsQueryKey(id), enabled: id > 0 },
  });
  const { data: pfRequests } = useListGeneralRequests(
    { type: "pf_withdrawal" as any },
    {
      query: {
        queryKey: getListGeneralRequestsQueryKey({ type: "pf_withdrawal" as any }),
        enabled: id > 0,
      },
    },
  );

  const summary = buildProvidentFundSummary(
    employee,
    payslips ?? [],
    (pfRequests ?? []).filter((request) => request.employeeId === id),
  );

  return (
    <ProvidentFundLedgerCard
      title="Provident fund"
      description="PF is tracked separately from salary. Contributions start after probation, and the company matches each employee contribution."
      summary={summary}
      emptyText="No PF contributions or withdrawals recorded for this employee yet."
    />
  );
}

function SalaryTab({
  id,
  events,
}: {
  id: number;
  events: Array<{
    id: number;
    type: string;
    amount: number;
    amountMode?: string;
    percentValue?: number | null;
    date: string;
    reason?: string | null;
  }>;
}) {
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const canDeleteEvents = me?.role === "admin" || me?.role === "hr";
  const create = useCreateSalaryEvent();
  const update = useUpdateSalaryEvent();
  const del = useDeleteSalaryEvent();
  type EvType = "bonus" | "loan" | "increment" | "commission";
  type Mode = "fixed" | "percentage";
  const [type, setType] = useState<EvType>("bonus");
  const [mode, setMode] = useState<Mode>("fixed");
  const [amount, setAmount] = useState<number>(10000);
  const [percent, setPercent] = useState<number>(10);
  const [percentBaseAmount, setPercentBaseAmount] = useState<number>(50000);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState<string>("");
  const [editing, setEditing] = useState<null | {
    id: number;
    type: EvType;
    mode: Mode;
    amount: number;
    percent: number;
    percentBaseAmount: number;
    date: string;
    reason: string;
  }>(null);
  const supportsPercentage = (t: EvType) => t === "increment" || t === "commission";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const usePercent = supportsPercentage(type) && mode === "percentage";
    const data = usePercent
      ? {
          type,
          amountMode: "percentage" as const,
          amount: percentBaseAmount,
          percentValue: percent,
          date: date as unknown as string,
          reason: reason || undefined,
        }
      : {
          type,
          amountMode: "fixed" as const,
          amount,
          date: date as unknown as string,
          reason: reason || undefined,
        };
    create.mutate(
      { id, data },
      {
        onSuccess: () => {
          toast.success("Salary event recorded");
          qc.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
          qc.invalidateQueries({ queryKey: getGetEmployeeJourneyQueryKey(id) });
          setReason("");
          setPercentBaseAmount(50000);
        },
        onError: () => toast.error("Could not record event"),
      },
    );
  };

  const onSaveEdit = () => {
    if (!editing) return;
    const usePercent =
      supportsPercentage(editing.type) && editing.mode === "percentage";
    const data = usePercent
      ? {
          type: editing.type,
          amountMode: "percentage" as const,
          amount: editing.percentBaseAmount,
          percentValue: editing.percent,
          date: editing.date as unknown as string,
          reason: editing.reason || null,
        }
      : {
          type: editing.type,
          amountMode: "fixed" as const,
          amount: editing.amount,
          percentValue: null,
          date: editing.date as unknown as string,
          reason: editing.reason || null,
        };
    update.mutate(
      {
        id,
        eventId: editing.id,
        data,
      },
      {
        onSuccess: () => {
          toast.success("Updated");
          qc.invalidateQueries({ queryKey: getGetEmployeeQueryKey(id) });
          qc.invalidateQueries({ queryKey: getGetEmployeeJourneyQueryKey(id) });
          setEditing(null);
        },
        onError: () => toast.error("Could not update event"),
      },
    );
  };

  return (
    <div className="space-y-6">
    {isAdmin && <PayrollSnapshotCard id={id} />}
    <div className="grid gap-5 lg:grid-cols-3">
      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <p className="text-sm font-semibold">Add a salary event</p>
        <Select
          value={type}
          onValueChange={(v) => {
            const next = v as EvType;
            setType(next);
            if (!supportsPercentage(next)) setMode("fixed");
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bonus">Bonus</SelectItem>
            <SelectItem value="loan">Loan</SelectItem>
            <SelectItem value="increment">Increment (Salary)</SelectItem>
            <SelectItem value="commission">Commission</SelectItem>
          </SelectContent>
        </Select>
        {supportsPercentage(type) && (
          <div className="flex gap-2 rounded-md border border-border p-1">
            <button
              type="button"
              onClick={() => setMode("fixed")}
              className={cn(
                "flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition",
                mode === "fixed"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Fixed amount
            </button>
            <button
              type="button"
              onClick={() => setMode("percentage")}
              className={cn(
                "flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition",
                mode === "percentage"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Percentage of basic
            </button>
          </div>
        )}
        {supportsPercentage(type) && mode === "percentage" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">% of amount</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={percentBaseAmount}
                onChange={(e) => setPercentBaseAmount(Number(e.target.value))}
                placeholder="50000"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">% value</Label>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={percent}
                  onChange={(e) => setPercent(Number(e.target.value))}
                  placeholder="20"
                  className="pr-8"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Input
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            placeholder="Amount (PKR)"
          />
        )}
        <DateField value={date} onChange={setDate} />
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          rows={2}
        />
        <Button type="submit" className="w-full" disabled={create.isPending}>
          {create.isPending ? "Recording..." : "Record event"}
        </Button>
      </form>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
        <p className="mb-3 text-sm font-semibold">Salary history</p>
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No salary events recorded yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">
                    {e.type}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {formatDate(e.date)}
                    </span>
                  </p>
                  {e.reason && (
                    <p className="text-xs text-muted-foreground">{e.reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatCurrency(e.amount)}
                    </p>
                    {e.amountMode === "percentage" &&
                      e.percentValue != null && (
                        <p className="text-[11px] text-muted-foreground">
                          {e.percentValue}% of {formatCurrency(inferPercentageBaseAmount(e.amount, e.percentValue))}
                        </p>
                      )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() =>
                      setEditing({
                        id: e.id,
                        type: e.type as EvType,
                        mode:
                          (e.amountMode as Mode) === "percentage"
                            ? "percentage"
                            : "fixed",
                        amount: e.amount,
                        percent: e.percentValue ?? 10,
                        percentBaseAmount: inferPercentageBaseAmount(
                          e.amount,
                          e.percentValue,
                        ),
                        date: e.date,
                        reason: e.reason ?? "",
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {canDeleteEvents && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                      onClick={() =>
                        del.mutate(
                          { id, eventId: e.id },
                          {
                            onSuccess: () => {
                              toast.success("Removed");
                              qc.invalidateQueries({
                                queryKey: getGetEmployeeQueryKey(id),
                              });
                              qc.invalidateQueries({
                                queryKey: getGetEmployeeJourneyQueryKey(id),
                              });
                            },
                          },
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
    {editing && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={() => setEditing(null)}
      >
        <div
          className="w-full max-w-md space-y-3 rounded-xl border border-border bg-card p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-semibold">Edit salary event</p>
          <Select
            value={editing.type}
            onValueChange={(v) => {
              const next = v as EvType;
              setEditing({
                ...editing,
                type: next,
                mode: supportsPercentage(next) ? editing.mode : "fixed",
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bonus">Bonus</SelectItem>
              <SelectItem value="loan">Loan</SelectItem>
              <SelectItem value="increment">Increment (Salary)</SelectItem>
              <SelectItem value="commission">Commission</SelectItem>
            </SelectContent>
          </Select>
          {supportsPercentage(editing.type) && (
            <div className="flex gap-2 rounded-md border border-border p-1">
              <button
                type="button"
                onClick={() => setEditing({ ...editing, mode: "fixed" })}
                className={cn(
                  "flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition",
                  editing.mode === "fixed"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Fixed amount
              </button>
              <button
                type="button"
                onClick={() => setEditing({ ...editing, mode: "percentage" })}
                className={cn(
                  "flex-1 rounded-sm px-3 py-1.5 text-xs font-medium transition",
                  editing.mode === "percentage"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Percentage of basic
              </button>
            </div>
          )}
          {supportsPercentage(editing.type) && editing.mode === "percentage" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">% of amount</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.percentBaseAmount}
                  onChange={(e) =>
                    setEditing({ ...editing, percentBaseAmount: Number(e.target.value) })
                  }
                  placeholder="50000"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">% value</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editing.percent}
                    onChange={(e) =>
                      setEditing({ ...editing, percent: Number(e.target.value) })
                    }
                    placeholder="20"
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Input
              type="number"
              min={0}
              value={editing.amount}
              onChange={(e) =>
                setEditing({ ...editing, amount: Number(e.target.value) })
              }
              placeholder="Amount (PKR)"
            />
          )}
          <DateField
            value={editing.date}
            onChange={(v) => setEditing({ ...editing, date: v })}
          />
          <Textarea
            value={editing.reason}
            onChange={(e) =>
              setEditing({ ...editing, reason: e.target.value })
            }
            rows={2}
            placeholder="Reason (optional)"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSaveEdit}
              disabled={update.isPending}
            >
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

function SalaryComponentsCard({ id }: { id: number }) {
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const isAdmin = me?.role === "admin";
  const { data: components } = useListSalaryComponents(id, {
    query: { queryKey: getListSalaryComponentsQueryKey(id), enabled: !!id },
  });
  const create = useCreateSalaryComponent();
  const del = useDeleteSalaryComponent();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<
    "designation" | "commission" | "allowance" | "provident_fund" | "other"
  >("allowance");
  const [valueType, setValueType] = useState<"fixed" | "percentage">("fixed");
  const [value, setValue] = useState<number>(0);
  const [isDeduction, setIsDeduction] = useState(false);
  const [isTaxable, setIsTaxable] = useState(true);

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error("Label is required");
      return;
    }
    create.mutate(
      {
        id,
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
          qc.invalidateQueries({
            queryKey: getListSalaryComponentsQueryKey(id),
          });
          setLabel("");
          setValue(0);
          setIsTaxable(true);
        },
        onError: () => toast.error("Could not add component"),
      },
    );
  };

  const handleDelete = (cid: number) => {
    del.mutate(
      { id, componentId: cid },
      {
        onSuccess: () => {
          toast.success("Removed");
          qc.invalidateQueries({
            queryKey: getListSalaryComponentsQueryKey(id),
          });
        },
      },
    );
  };

  // Auto-pick deduction default for PF
  const onKindChange = (k: typeof kind) => {
    setKind(k);
    setIsDeduction(k === "provident_fund");
    if (k === "provident_fund") setIsTaxable(false);
    if (k === "provident_fund") setValueType("percentage");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <form
        onSubmit={onAdd}
        className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <p className="text-sm font-semibold">Add salary component</p>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. House rent)"
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select value={kind} onValueChange={(v) => onKindChange(v as typeof kind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="designation">Designation (basic)</SelectItem>
              <SelectItem value="allowance">Allowance</SelectItem>
              <SelectItem value="commission">Commission</SelectItem>
              <SelectItem value="provident_fund">Provident Fund</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mode</Label>
            <Select
              value={valueType}
              onValueChange={(v) => setValueType(v as typeof valueType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed (PKR)</SelectItem>
                <SelectItem value="percentage">% of basic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isDeduction}
            onChange={(e) => {
              const next = e.target.checked;
              setIsDeduction(next);
              if (next) setIsTaxable(false);
            }}
          />
          This is a deduction
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isTaxable}
            disabled={isDeduction}
            onChange={(e) => setIsTaxable(e.target.checked)}
          />
          Deduct tax from this
        </label>
        <Button
          type="submit"
          className="w-full"
          disabled={create.isPending}
        >
          {create.isPending ? "Adding..." : "Add component"}
        </Button>
      </form>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
        <p className="mb-3 text-sm font-semibold">Salary components</p>
        {(components ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No components defined. Payslips will fall back to the basic salary
            and allowances on the profile.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(components ?? []).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {c.label}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        c.isDeduction
                          ? "bg-rose-100 text-rose-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {c.isDeduction ? "Deduction" : "Earning"}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {c.kind.replace("_", " ")} · {c.valueType}
                    {!c.isDeduction && c.isTaxable === false
                      ? " · non-taxable"
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold">
                    {c.valueType === "percentage"
                      ? `${c.value}%`
                      : formatCurrency(c.value)}
                  </p>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AttendanceTab({
  id,
  employee,
}: {
  id: number;
  employee: {
    officeStartTime?: string | null;
    officeEndTime?: string | null;
    gracePeriodMinutes?: number | null;
    breakMinutes?: number | null;
  };
}) {
  const resolveWorkedMinutes = (record: {
    checkInTime?: string | null;
    checkOutTime?: string | null;
    workedMinutes?: number | null;
    pausedMinutes?: number | null;
    pausedAt?: string | null;
  }) => {
    if (!record.checkInTime || record.checkOutTime) {
      return record.workedMinutes ?? 0;
    }
    const nowMs = Date.now();
    const activePauseMinutes = record.pausedAt
      ? Math.max(0, Math.floor((nowMs - new Date(record.pausedAt).getTime()) / 60000))
      : 0;
    return Math.max(
      0,
      Math.floor((nowMs - new Date(record.checkInTime).getTime()) / 60000) -
        (record.pausedMinutes ?? 0) -
        activePauseMinutes,
    );
  };
  const now = new Date();
  const [month, setMonth] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const { data, isLoading } = useGetEmployeeAttendance(
    id,
    { month },
    {
      query: {
        queryKey: getGetEmployeeAttendanceQueryKey(id, { month }),
      },
    },
  );
  const calendarParams = { employeeId: id, month };
  const { data: calendar } = useGetAttendanceCalendar(calendarParams, {
    query: {
      queryKey: getGetAttendanceCalendarQueryKey(calendarParams),
    },
  });

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const rows = useMemo(
    () =>
      (calendar?.days ?? [])
        .filter((day) =>
          ["present", "late", "absent", "on_leave", "half_day", "remote_work"].includes(
            day.status,
          ),
        )
        .map((day: AttendanceCalendarDay) => ({
          id: day.record?.id ?? day.date,
          date: day.date,
          status: day.status,
          checkInTime: day.record?.checkInTime ?? null,
          checkOutTime: day.record?.checkOutTime ?? null,
          workedMinutes: normalizeAttendanceWorkedMinutes({
            status: day.status,
            workedMinutes: day.record ? resolveWorkedMinutes(day.record) : null,
            officeStartTime: employee.officeStartTime,
            officeEndTime: employee.officeEndTime,
            breakMinutes: employee.breakMinutes,
          }),
        })),
    [
      calendar,
      employee.breakMinutes,
      employee.officeEndTime,
      employee.officeStartTime,
    ],
  );

  const summary = useMemo(() => {
    const s = {
      present: 0,
      late: 0,
      absent: 0,
      on_leave: 0,
      monthMinutes: 0,
      weekMinutes: 0,
    };
    const today = new Date();
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const diff = (day + 6) % 7;
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const source = rows.length > 0 ? rows : data ?? [];
    for (const r of source) {
      if (r.status === "present") s.present += 1;
      else if (r.status === "late") s.late += 1;
      else if (r.status === "on_leave") s.on_leave += 1;
      else s.absent += 1;
      const minutes = r.workedMinutes ?? 0;
      s.monthMinutes += minutes;
      const d = new Date(r.date);
      if (d >= startOfWeek && d <= today) s.weekMinutes += minutes;
    }
    return s;
  }, [data, rows]);

  const targets = useMemo(
    () =>
      buildScheduledHoursTargets({
        officeStartTime: employee.officeStartTime,
        officeEndTime: employee.officeEndTime,
        breakMinutes: employee.breakMinutes,
        offDays: settings?.weeklyOffDays ?? [0, 6],
        holidayDates: new Set(
          (settings?.publicHolidays ?? []).map((holiday) => holiday.date as unknown as string),
        ),
        month,
      }),
    [
      employee.officeEndTime,
      employee.officeStartTime,
      employee.breakMinutes,
      month,
      settings?.publicHolidays,
      settings?.weeklyOffDays,
    ],
  );

  const weeklyTarget = targets.weekly;
  const monthlyTarget = targets.monthly;
  const weekHours = (summary.weekMinutes / 60).toFixed(1);
  const monthHours = (summary.monthMinutes / 60).toFixed(1);
  const weekValue =
    weeklyTarget > 0 ? `${weekHours} / ${weeklyTarget} h` : `${weekHours} h`;
  const monthValue =
    monthlyTarget > 0 ? `${monthHours} / ${monthlyTarget} h` : `${monthHours} h`;
  const weekPct =
    weeklyTarget > 0
      ? Math.min(100, Math.round((summary.weekMinutes / (weeklyTarget * 60)) * 100))
      : null;
  const monthPct =
    monthlyTarget > 0
      ? Math.min(100, Math.round((summary.monthMinutes / (monthlyTarget * 60)) * 100))
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-44"
        />
      </div>
      <AttendanceRuleHint
        officeStartTime={employee.officeStartTime}
        gracePeriodMinutes={employee.gracePeriodMinutes}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Present"
          value={summary.present + summary.late}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard label="Late" value={summary.late} icon={Clock} tone="warning" />
        <StatCard label="Absent" value={summary.absent} icon={XCircle} tone="danger" />
        <StatCard label="On leave" value={summary.on_leave} icon={Plane} tone="info" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="This week"
          value={weekValue}
          sub={
            weekPct !== null
              ? `${weekPct}% of weekly target completed`
              : "Worked this week"
          }
          icon={CalendarDays}
          tone="info"
        />
        <StatCard
          label="This month"
          value={monthValue}
          sub={
            monthPct !== null
              ? `${monthPct}% of monthly target completed`
              : "Worked this month"
          }
          icon={CalendarRange}
          tone="success"
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead className="text-right">Worked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No records for this month.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>{formatTime(r.checkInTime)}</TableCell>
                  <TableCell>{formatTime(r.checkOutTime)}</TableCell>
                  <TableCell className="text-right">{formatDuration(r.workedMinutes)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PayslipsTab({ id }: { id: number }) {
  const qc = useQueryClient();
  const { data: payslips } = useGetEmployeePayslips(id, {
    query: { queryKey: getGetEmployeePayslipsQueryKey(id) },
  });
  const generate = useGeneratePayslip();
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [viewing, setViewing] = useState<typeof payslips extends Array<infer P> ? P | null : never | null>(
    null,
  );

  const onGenerate = () => {
    generate.mutate(
      { data: { employeeId: id, month, year } },
      {
        onSuccess: (p) => {
          toast.success(`Payslip generated for ${formatMonth(month, year)}`);
          qc.invalidateQueries({ queryKey: getGetEmployeePayslipsQueryKey(id) });
          setViewing(p as any);
        },
        onError: () => toast.error("Could not generate payslip"),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="space-y-1.5">
          <Label className="text-xs">Month</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(Number(v))}
          >
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
            className="w-28"
          />
        </div>
        <Button onClick={onGenerate} disabled={generate.isPending} className="ml-auto">
          {generate.isPending ? "Generating..." : "Generate payslip"}
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {(payslips ?? []).length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No payslips generated yet for this employee.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Working days</TableHead>
                <TableHead>Present / Late</TableHead>
                <TableHead className="text-right">Net salary</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(payslips ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatMonth(p.month, p.year)}</TableCell>
                  <TableCell>{p.totalWorkingDays}</TableCell>
                  <TableCell>{p.presentDays} / {p.lateCount}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(p.netSalary)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => setViewing(p as any)}
                    >
                      <FileDown className="h-4 w-4" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Payslip</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            {viewing && <PayslipView payslip={viewing as any} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return fetch(getApiUrl("/api/uploads"), {
    method: "POST",
    body: fd,
    credentials: "include",
  }).then(async (r) => {
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      let msg = `Upload failed (${r.status})`;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.message) msg = parsed.message;
      } catch {
        if (text) msg = text;
      }
      throw new Error(msg);
    }
    return r.json();
  });
}

function AvatarUploader({
  employeeId,
  currentName,
  currentUrl,
}: {
  employeeId: number;
  currentName: string;
  currentUrl: string | null;
}) {
  const qc = useQueryClient();
  const update = useUpdateEmployee();
  const [uploading, setUploading] = useState(false);

  const onPick = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await uploadFile(file);
      await new Promise<void>((resolve, reject) =>
        update.mutate(
          { id: employeeId, data: { avatarUrl: url } },
          {
            onSuccess: () => {
              qc.invalidateQueries({
                queryKey: getGetEmployeeQueryKey(employeeId),
              });
              qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
              toast.success("Profile photo updated");
              resolve();
            },
            onError: () => {
              toast.error("Could not save photo");
              reject(new Error("save failed"));
            },
          },
        ),
      );
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onClear = () => {
    update.mutate(
      { id: employeeId, data: { avatarUrl: null } },
      {
        onSuccess: () => {
          qc.invalidateQueries({
            queryKey: getGetEmployeeQueryKey(employeeId),
          });
          qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
          toast.success("Photo removed");
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">Profile photo</Label>
      <div className="flex items-center gap-3">
        <EmployeeAvatar name={currentName} url={currentUrl} size="lg" />
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading..." : currentUrl ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPick(f);
                e.target.value = "";
              }}
            />
          </label>
          {currentUrl && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-rose-600"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentUploader({
  label,
  uploadLabel,
  employeeId,
  currentUrl,
  currentName,
  payloadKeys,
}: {
  label: string;
  uploadLabel: string;
  employeeId: number;
  currentUrl: string | null;
  currentName: string | null;
  payloadKeys: { url: string; name: string };
}) {
  const qc = useQueryClient();
  const update = useUpdateEmployee();
  const [uploading, setUploading] = useState(false);
  const normalizedLabel = currentName || label;
  const lowerAsset = `${currentUrl ?? ""} ${normalizedLabel}`.toLowerCase();
  const isImageAsset =
    /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(lowerAsset) ||
    lowerAsset.includes("image/");

  const onPick = async (file: File) => {
    setUploading(true);
    try {
      const { url, name } = await uploadFile(file);
      update.mutate(
        {
          id: employeeId,
          data: { [payloadKeys.url]: url, [payloadKeys.name]: name } as any,
        },
        {
          onSuccess: () => {
            qc.invalidateQueries({
              queryKey: getGetEmployeeQueryKey(employeeId),
            });
            toast.success(`${label} uploaded`);
          },
          onError: (err) =>
            toast.error(
              err instanceof Error
                ? `Could not save ${label.toLowerCase()}: ${err.message}`
                : `Could not save ${label.toLowerCase()}`,
            ),
        },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onClear = () => {
    update.mutate(
      {
        id: employeeId,
        data: { [payloadKeys.url]: null, [payloadKeys.name]: null } as any,
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({
            queryKey: getGetEmployeeQueryKey(employeeId),
          });
          toast.success(`${label} removed`);
        },
      },
    );
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
        {uploading && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{uploadLabel}</span>
              <span>Please wait</span>
            </div>
            <Progress value={72} className="h-2" />
          </div>
        )}
        {currentUrl ? (
          <div className="space-y-3">
            {isImageAsset ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-border bg-card"
              >
                <img
                  src={currentUrl}
                  alt={normalizedLabel}
                  className="h-48 w-full object-contain bg-muted/30"
                />
              </a>
            ) : (
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm font-medium text-primary hover:underline"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{normalizedLabel}</span>
              </a>
            )}
            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <FileText className="h-4 w-4 shrink-0" />
              <span className="truncate">{normalizedLabel}</span>
            </a>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? "Uploading..." : "Replace"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPick(f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs text-muted-foreground hover:border-border hover:bg-card hover:text-rose-600"
                aria-label={`Remove ${label}`}
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {isImageAsset
                ? "Image preview available. Click the preview to open the full file."
                : "PDF, Word, or image file, up to 10 MB."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading..." : "Upload file"}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPick(f);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              PDF or Word, up to 10 MB.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ContractUploader(props: {
  employeeId: number;
  currentUrl: string | null;
  currentName: string | null;
}) {
  return (
    <DocumentUploader
      label="Employment contract"
      uploadLabel="Uploading employment contract..."
      payloadKeys={{ url: "employmentContractUrl", name: "employmentContractName" }}
      {...props}
    />
  );
}

