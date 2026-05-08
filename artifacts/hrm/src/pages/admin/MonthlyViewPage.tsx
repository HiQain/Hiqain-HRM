import { useEffect, useMemo, useRef, useState } from "react";
import {
  type GetMonthlyAdminViewQueryResult,
  getGetMonthlyAdminViewQueryKey,
  useGetMonthlyAdminView,
} from "@workspace/api-client-react";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn, formatCurrency, formatDateShort } from "@/lib/utils";

const ATTENDANCE_STICKY_LEFT = {
  doj: 0,
  employee: 110,
  designation: 280,
};

const SALARY_STICKY_LEFT = {
  doj: 0,
  employee: 110,
  designation: 280,
};

const ATTENDANCE_WIDTHS = {
  doj: "w-[110px] min-w-[110px] max-w-[110px]",
  employee: "w-[170px] min-w-[170px] max-w-[170px]",
  designation: "w-[190px] min-w-[190px] max-w-[190px]",
};

const SALARY_WIDTHS = {
  doj: "w-[110px] min-w-[110px] max-w-[110px]",
  employee: "w-[170px] min-w-[170px] max-w-[170px]",
  designation: "w-[190px] min-w-[190px] max-w-[190px]",
};

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDateValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthYear(value: string) {
  const [year, month] = value.split("-").map(Number);
  return {
    year: year || new Date().getFullYear(),
    month: month || new Date().getMonth() + 1,
  };
}

function dayHeaderLabel(date: string) {
  const day = new Date(`${date}T00:00:00Z`);
  return {
    shortDay: day.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone: "UTC",
    }),
    shortDate: day.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

function formatCompactDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function attendanceTone(status: string, isOffDay: boolean) {
  if (status === "inactive") return "bg-slate-50 text-slate-300 border-slate-200";
  if (status === "future") return "bg-white text-slate-300 border-slate-200";
  if (isOffDay || status === "off") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "present") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "late") return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "absent") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "on_leave") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "half_day") return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === "remote_work") return "bg-teal-50 text-teal-700 border-teal-200";
  return "bg-muted text-muted-foreground border-border";
}

function stickyCell(left: number, z = 20) {
  return {
    left: `${left}px`,
    zIndex: z,
  } as const;
}

export function AdminMonthlyViewPage() {
  const [tab, setTab] = useState<"attendance" | "salary">("attendance");
  const [monthValue, setMonthValue] = useState(currentMonthValue);
  const [attendanceScrollDate, setAttendanceScrollDate] = useState<string | null>(null);
  const attendanceScrollRef = useRef<HTMLDivElement | null>(null);
  const { month, year } = useMemo(() => toMonthYear(monthValue), [monthValue]);
  const params = useMemo(() => ({ month, year }), [month, year]);
  const { data, isLoading } = useGetMonthlyAdminView(params, {
    query: { queryKey: getGetMonthlyAdminViewQueryKey(params) },
  });

  useEffect(() => {
    if (tab !== "attendance" || !attendanceScrollDate) return;
    if (!(data?.days ?? []).some((day) => day.date === attendanceScrollDate)) return;

    const frame = window.requestAnimationFrame(() => {
      const container = attendanceScrollRef.current;
      const target = container?.querySelector<HTMLElement>(
        `[data-day-date="${attendanceScrollDate}"]`,
      );
      target?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
      setAttendanceScrollDate(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [attendanceScrollDate, data?.days, tab]);

  const onToday = () => {
    setMonthValue(currentMonthValue());
    setTab("attendance");
    setAttendanceScrollDate(currentDateValue());
  };

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <PageHeader
        title="View"
        description="Excel-style monthly attendance and salary sheets for the whole team."
        actions={
          <div className="flex max-w-full items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Input
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
              className="w-40 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            />
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as "attendance" | "salary")}
        className="min-w-0"
      >
        <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <TabsList className="grid h-auto w-full max-w-md grid-cols-2 rounded-2xl bg-slate-100 p-1">
            <TabsTrigger
              value="attendance"
              className="rounded-xl py-3 text-base data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Attendance
            </TabsTrigger>
            <TabsTrigger
              value="salary"
              className="rounded-xl py-3 text-base data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Salary
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="attendance" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-lg px-3 py-1 text-sm">
                Whole month attendance grid
              </Badge>
              {data?.attendance?.totalOffDays != null && (
                <Badge variant="secondary" className="rounded-lg px-3 py-1 text-sm">
                  Off days: {data.attendance.totalOffDays}
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onToday}>
              Today
            </Button>
          </div>

          <AttendanceSheet
            data={data}
            isLoading={isLoading}
            scrollContainerRef={attendanceScrollRef}
          />
        </TabsContent>

        <TabsContent value="salary" className="mt-5">
          <SalarySheet data={data} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttendanceSheet({
  data,
  isLoading,
  scrollContainerRef,
}: {
  data: GetMonthlyAdminViewQueryResult | undefined;
  isLoading: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="max-w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div
        ref={scrollContainerRef}
        className="max-w-full overflow-x-auto overflow-y-hidden"
      >
        <div className="inline-block min-w-full align-top">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-600",
                    ATTENDANCE_WIDTHS.doj,
                  )}
                  style={stickyCell(ATTENDANCE_STICKY_LEFT.doj, 43)}
                >
                  DOJ
                </th>
                <th
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-600",
                    ATTENDANCE_WIDTHS.employee,
                  )}
                  style={stickyCell(ATTENDANCE_STICKY_LEFT.employee, 42)}
                >
                  Names
                </th>
                <th
                  className={cn(
                    "sticky border border-r-2 border-slate-300 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-600 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                    ATTENDANCE_WIDTHS.designation,
                  )}
                  style={stickyCell(ATTENDANCE_STICKY_LEFT.designation, 41)}
                >
                  Designation
                </th>
                <th className="min-w-[150px] border border-slate-200 px-4 py-3 text-left text-base font-semibold text-slate-600">
                  Probation End
                </th>
                <th className="min-w-[110px] border border-slate-200 px-4 py-3 text-left text-base font-semibold text-slate-600">
                  Status
                </th>
                <th className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Annual
                </th>
                <th className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Casual
                </th>
                <th className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Sick
                </th>
                <th className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Absent
                </th>
                <th className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Late
                </th>
                <th className="min-w-[100px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Total Offs
                </th>
                {(data?.days ?? []).map((day) => {
                  const header = dayHeaderLabel(day.date);
                  return (
                    <th
                      key={day.date}
                      data-day-date={day.date}
                      className={cn(
                        "min-w-[110px] border border-slate-200 px-2 py-2.5 text-center align-top",
                        day.isOffDay ? "bg-amber-50/50" : "bg-slate-50",
                      )}
                    >
                      <div className="text-[15px] font-semibold leading-none text-slate-700">
                        {header.shortDay}
                      </div>
                      <div className="mt-2 text-[13px] leading-snug text-slate-500">
                        {header.shortDate}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={11 + (data?.days?.length ?? 0)}
                    className="border border-slate-200 px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading monthly attendance view...
                  </td>
                </tr>
              ) : (data?.attendance?.rows ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={11 + (data?.days?.length ?? 0)}
                    className="border border-slate-200 px-4 py-12 text-center text-muted-foreground"
                  >
                    No attendance data for this month.
                  </td>
                </tr>
              ) : (
                (data?.attendance?.rows ?? []).map((row) => (
                  <tr
                    key={row.employeeId}
                    className={cn(
                      "bg-white",
                      row.employmentStatus === "left" && "bg-rose-50/50",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-medium text-slate-800",
                        ATTENDANCE_WIDTHS.doj,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(ATTENDANCE_STICKY_LEFT.doj, 33)}
                    >
                      {formatCompactDate(row.doj)}
                    </td>
                    <td
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-900",
                        ATTENDANCE_WIDTHS.employee,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(ATTENDANCE_STICKY_LEFT.employee, 32)}
                    >
                      {row.employeeName}
                    </td>
                    <td
                      className={cn(
                        "sticky border border-r-2 border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                        ATTENDANCE_WIDTHS.designation,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(ATTENDANCE_STICKY_LEFT.designation, 31)}
                    >
                      {row.designation || "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-slate-500">
                      {formatDateShort(row.probationEndDate)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5">
                      <Badge
                        variant={row.employmentStatus === "left" ? "destructive" : "secondary"}
                        className="rounded-lg"
                      >
                        {row.employmentStatus === "left" ? "Left" : "Active"}
                      </Badge>
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-lg text-slate-800">
                      {row.annualLeaves}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-lg text-slate-800">
                      {row.casualLeaves}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-lg text-slate-800">
                      {row.sickLeaves}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-lg text-slate-800">
                      {row.absentDays}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-lg text-slate-800">
                      {row.lateDays}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-lg text-slate-800">
                      {row.totalOffDays}
                    </td>
                    {row.dayCells.map((cell) => (
                      <td
                        key={cell.date}
                        className={cn(
                          "border border-slate-200 px-2 py-2 text-center",
                          cell.isOffDay && cell.status !== "future" && "bg-amber-50/30",
                        )}
                        title={[
                          cell.status,
                          cell.checkInTime
                            ? `In: ${new Date(cell.checkInTime).toLocaleTimeString()}`
                            : "",
                          cell.checkOutTime
                            ? `Out: ${new Date(cell.checkOutTime).toLocaleTimeString()}`
                            : "",
                          cell.excused ? "Excused" : "",
                          cell.notes ?? "",
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      >
                        <span
                          className={cn(
                            "inline-flex min-w-[54px] justify-center rounded-xl border px-2.5 py-1.5 text-sm font-semibold leading-none",
                            attendanceTone(cell.status, cell.isOffDay),
                          )}
                        >
                          {cell.label || "—"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SalarySheet({
  data,
  isLoading,
}: {
  data: GetMonthlyAdminViewQueryResult | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="max-w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="max-w-full overflow-x-auto overflow-y-hidden">
        <div className="inline-block min-w-full align-top">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-600",
                    SALARY_WIDTHS.doj,
                  )}
                  style={stickyCell(SALARY_STICKY_LEFT.doj, 43)}
                >
                  DOJ
                </th>
                <th
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-600",
                    SALARY_WIDTHS.employee,
                  )}
                  style={stickyCell(SALARY_STICKY_LEFT.employee, 42)}
                >
                  Names
                </th>
                <th
                  className={cn(
                    "sticky border border-r-2 border-slate-300 bg-slate-50 px-4 py-3 text-left text-base font-semibold text-slate-600 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                    SALARY_WIDTHS.designation,
                  )}
                  style={stickyCell(SALARY_STICKY_LEFT.designation, 41)}
                >
                  Designation
                </th>
                <th className="min-w-[140px] border border-slate-200 px-4 py-3 text-left text-base font-semibold text-slate-600">
                  Department
                </th>
                <th className="min-w-[120px] border border-slate-200 px-4 py-3 text-left text-base font-semibold text-slate-600">
                  Payroll
                </th>
                <th className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Basic
                </th>
                <th className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Allowances
                </th>
                <th className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Gross
                </th>
                <th className="min-w-[95px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Working
                </th>
                <th className="min-w-[90px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Present
                </th>
                <th className="min-w-[90px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Paid Leave
                </th>
                <th className="min-w-[90px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Absent
                </th>
                <th className="min-w-[80px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Late
                </th>
                <th className="min-w-[120px] border border-slate-200 px-3 py-3 text-center text-base font-semibold text-slate-600">
                  Late Penalty
                </th>
                <th className="min-w-[110px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Bonus
                </th>
                <th className="min-w-[130px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Loan Deduction
                </th>
                <th className="min-w-[140px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Other Deductions
                </th>
                <th className="min-w-[100px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Tax
                </th>
                <th className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-base font-semibold text-slate-600">
                  Net Salary
                </th>
                <th className="min-w-[150px] border border-slate-200 px-4 py-3 text-left text-base font-semibold text-slate-600">
                  Generated
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={20}
                    className="border border-slate-200 px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading monthly salary view...
                  </td>
                </tr>
              ) : (data?.salary?.rows ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={20}
                    className="border border-slate-200 px-4 py-12 text-center text-muted-foreground"
                  >
                    No salary data for this month.
                  </td>
                </tr>
              ) : (
                (data?.salary?.rows ?? []).map((row) => (
                  <tr
                    key={row.employeeId}
                    className={cn(
                      "bg-white",
                      row.employmentStatus === "left" && "bg-rose-50/50",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-medium text-slate-800",
                        SALARY_WIDTHS.doj,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(SALARY_STICKY_LEFT.doj, 33)}
                    >
                      {formatCompactDate(row.doj)}
                    </td>
                    <td
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-900",
                        SALARY_WIDTHS.employee,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(SALARY_STICKY_LEFT.employee, 32)}
                    >
                      {row.employeeName}
                    </td>
                    <td
                      className={cn(
                        "sticky border border-r-2 border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                        SALARY_WIDTHS.designation,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(SALARY_STICKY_LEFT.designation, 31)}
                    >
                      {row.designation || "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-slate-800">
                      {row.department || "—"}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5">
                      <Badge
                        variant={row.payrollStatus === "generated" ? "secondary" : "outline"}
                        className="rounded-lg"
                      >
                        {row.payrollStatus === "generated" ? "Generated" : "Pending"}
                      </Badge>
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-800">
                      {formatCurrency(row.basicSalary)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-800">
                      {formatCurrency(row.allowances)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-900">
                      {formatCurrency(row.grossSalary)}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-slate-800">
                      {row.totalWorkingDays}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-slate-800">
                      {row.presentDays}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-slate-800">
                      {row.paidLeaveDays}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-slate-800">
                      {row.absentDays}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-slate-800">
                      {row.lateCount}
                    </td>
                    <td className="border border-slate-200 px-2 py-2.5 text-center text-slate-800">
                      {row.latePenaltyDays}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-800">
                      {formatCurrency(row.bonus)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-800">
                      {formatCurrency(row.loanDeduction)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right text-slate-800">
                      {formatCurrency(row.otherDeductions)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-rose-600">
                      {formatCurrency(row.payrollTax)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-900">
                      {formatCurrency(row.netSalary)}
                    </td>
                    <td className="border border-slate-200 px-3 py-2.5 text-slate-500">
                      {row.generatedAt ? formatDateShort(row.generatedAt) : "Not generated"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
