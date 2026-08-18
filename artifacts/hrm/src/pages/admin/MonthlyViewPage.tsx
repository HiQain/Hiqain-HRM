import { useEffect, useMemo, useRef, useState } from "react";
import {
  type GetMonthlyAdminViewQueryResult,
  getGetMonthlyAdminViewQueryKey,
  updateMonthlyViewColumnPreferences,
  useGetMonthlyAdminView,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Columns3, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type MonthlyViewTab = "attendance" | "salary";

type HiddenColumnsByTab = Record<MonthlyViewTab, Set<string>>;

type ColumnOption = {
  id: string;
  label: string;
};

const ATTENDANCE_COLUMNS: ColumnOption[] = [
  { id: "doj", label: "DOJ" },
  { id: "employee", label: "Names" },
  { id: "designation", label: "Designation" },
  { id: "probationEnd", label: "Probation End" },
  { id: "status", label: "Status" },
  { id: "annual", label: "Annual" },
  { id: "casual", label: "Casual" },
  { id: "sick", label: "Sick" },
  { id: "absent", label: "Absent" },
  { id: "late", label: "Late" },
  { id: "totalOffs", label: "Total Offs" },
];

const SALARY_COLUMNS: ColumnOption[] = [
  { id: "doj", label: "DOJ" },
  { id: "employee", label: "Names" },
  { id: "designation", label: "Designation" },
  { id: "department", label: "Department" },
  { id: "payroll", label: "Payroll" },
  { id: "basic", label: "Basic" },
  { id: "allowances", label: "Allowances" },
  { id: "gross", label: "Gross" },
  { id: "working", label: "Working" },
  { id: "present", label: "Present" },
  { id: "paidLeave", label: "Paid Leave" },
  { id: "absent", label: "Absent" },
  { id: "late", label: "Late" },
  { id: "latePenalty", label: "Late Penalty" },
  { id: "bonus", label: "Bonus" },
  { id: "loanDeduction", label: "Loan Deduction" },
  { id: "otherDeductions", label: "Other Deductions" },
  { id: "tax", label: "Tax" },
  { id: "netSalary", label: "Net Salary" },
  { id: "generated", label: "Generated" },
];

function attendanceDayColumnId(date: string) {
  return `day:${Number(date.slice(-2))}`;
}

function toColumnPreferences(hiddenColumns: HiddenColumnsByTab) {
  return {
    attendance: Array.from(hiddenColumns.attendance),
    salary: Array.from(hiddenColumns.salary),
  };
}

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

function escapeCsvValue(value: unknown) {
  if (value == null) return "";

  let text = String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  const escaped = text.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadMonthlyViewCsv(
  tab: MonthlyViewTab,
  data: GetMonthlyAdminViewQueryResult,
  hiddenColumnIds: Set<string>,
) {
  const exportMonth = `${data.year}-${String(data.month).padStart(2, "0")}`;

  if (tab === "attendance") {
    const dateByColumnId = new Map(
      data.days.map((day) => [attendanceDayColumnId(day.date), day.date]),
    );
    const columns = [
      ...ATTENDANCE_COLUMNS,
      ...data.days.map((day) => ({
        id: attendanceDayColumnId(day.date),
        label: `${day.dayName} ${day.date}`,
      })),
    ].filter((column) => !hiddenColumnIds.has(column.id));
    const rows = data.attendance.rows.map((row) => {
      const cellsByDate = new Map(
        row.dayCells.map((cell) => [cell.date, cell]),
      );
      const valuesByColumn: Record<string, unknown> = {
        doj: row.doj,
        employee: row.employeeName,
        designation: row.designation,
        probationEnd: row.probationEndDate,
        status: row.employmentStatus === "left" ? "Left" : "Active",
        annual: row.annualLeaves,
        casual: row.casualLeaves,
        sick: row.sickLeaves,
        absent: row.absentDays,
        late: row.lateDays,
        totalOffs: row.totalOffDays,
      };

      return columns.map((column) =>
        column.id.startsWith("day:")
          ? (cellsByDate.get(dateByColumnId.get(column.id) ?? "")?.label ?? "")
          : valuesByColumn[column.id],
      );
    });

    downloadCsv(
      `attendance-${exportMonth}.csv`,
      columns.map((column) => column.label),
      rows,
    );
    return;
  }

  const columns = SALARY_COLUMNS.filter(
    (column) => !hiddenColumnIds.has(column.id),
  );
  const rows = data.salary.rows.map((row) => {
    const valuesByColumn: Record<string, unknown> = {
      doj: row.doj,
      employee: row.employeeName,
      designation: row.designation,
      department: row.department,
      payroll: row.payrollStatus === "generated" ? "Generated" : "Pending",
      basic: row.basicSalary,
      allowances: row.allowances,
      gross: row.grossSalary,
      working: row.totalWorkingDays,
      present: row.presentDays,
      paidLeave: row.paidLeaveDays,
      absent: row.absentDays,
      late: row.lateCount,
      latePenalty: row.latePenaltyDays,
      bonus: row.bonus,
      loanDeduction: row.loanDeduction,
      otherDeductions: row.otherDeductions,
      tax: row.payrollTax,
      netSalary: row.netSalary,
      generated: row.generatedAt ?? "Not generated",
    };

    return columns.map((column) => valuesByColumn[column.id]);
  });

  downloadCsv(
    `salary-${exportMonth}.csv`,
    columns.map((column) => column.label),
    rows,
  );
}

function attendanceTone(status: string, isOffDay: boolean) {
  if (status === "inactive")
    return "bg-slate-50 text-slate-300 border-slate-200";
  if (status === "future") return "bg-white text-slate-300 border-slate-200";
  if (isOffDay || status === "off")
    return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "present")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "late")
    return "bg-orange-50 text-orange-700 border-orange-200";
  if (status === "absent") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "on_leave") return "bg-sky-50 text-sky-700 border-sky-200";
  if (status === "half_day")
    return "bg-violet-50 text-violet-700 border-violet-200";
  if (status === "remote_work")
    return "bg-teal-50 text-teal-700 border-teal-200";
  return "bg-muted text-muted-foreground border-border";
}

function stickyCell(left: number, z = 20) {
  return {
    left: `${left}px`,
    zIndex: z,
  } as const;
}

function ColumnVisibilityMenu({
  columns,
  disabled,
  hiddenColumnIds,
  onShowAll,
  onVisibilityChange,
}: {
  columns: ColumnOption[];
  disabled?: boolean;
  hiddenColumnIds: Set<string>;
  onShowAll: () => void;
  onVisibilityChange: (columnId: string, visible: boolean) => void;
}) {
  const visibleCount = columns.reduce(
    (count, column) => count + (hiddenColumnIds.has(column.id) ? 0 : 1),
    0,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={disabled}
        >
          <Columns3 className="h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-0">
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-80 overflow-y-auto p-1.5">
          {columns.map((column) => {
            const visible = !hiddenColumnIds.has(column.id);

            return (
              <div
                key={column.id}
                className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-slate-50"
              >
                <span
                  className="min-w-0 truncate text-sm text-slate-700"
                  title={column.label}
                >
                  {column.label}
                </span>
                <Switch
                  checked={visible}
                  disabled={visible && visibleCount === 1}
                  aria-label={`${visible ? "Hide" : "Show"} ${column.label} column`}
                  onCheckedChange={(checked) =>
                    onVisibilityChange(column.id, checked)
                  }
                />
              </div>
            );
          })}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <button
          type="button"
          className="w-full px-3 py-2.5 text-left text-sm font-medium text-primary hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-muted-foreground"
          disabled={visibleCount === columns.length}
          onClick={onShowAll}
        >
          Show all columns
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SyncedHorizontalScroll({
  children,
  label,
  scrollContainerRef,
}: {
  children: React.ReactNode;
  label: string;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const internalScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = scrollContainerRef ?? internalScrollContainerRef;
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    const bottomScroll = bottomScrollRef.current;
    if (!bottomScroll) return;

    const updateContentWidth = () => {
      setContentWidth((currentWidth) =>
        currentWidth === bottomScroll.scrollWidth
          ? currentWidth
          : bottomScroll.scrollWidth,
      );

      if (topScrollRef.current) {
        topScrollRef.current.scrollLeft = bottomScroll.scrollLeft;
      }
    };

    updateContentWidth();
    window.addEventListener("resize", updateContentWidth);

    const resizeObserver = new ResizeObserver(updateContentWidth);
    resizeObserver.observe(bottomScroll);
    const content = bottomScroll.firstElementChild;
    if (content instanceof HTMLElement) {
      resizeObserver.observe(content);
    }

    return () => {
      window.removeEventListener("resize", updateContentWidth);
      resizeObserver.disconnect();
    };
  }, [bottomScrollRef]);

  const syncFromTop = (event: React.UIEvent<HTMLDivElement>) => {
    const bottomScroll = bottomScrollRef.current;
    if (
      bottomScroll &&
      bottomScroll.scrollLeft !== event.currentTarget.scrollLeft
    ) {
      bottomScroll.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  const syncFromBottom = (event: React.UIEvent<HTMLDivElement>) => {
    const topScroll = topScrollRef.current;
    if (topScroll && topScroll.scrollLeft !== event.currentTarget.scrollLeft) {
      topScroll.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  return (
    <>
      <div className="border-b border-slate-200 bg-slate-50">
        <div
          ref={topScrollRef}
          role="region"
          aria-label={`${label} top horizontal scrollbar`}
          tabIndex={0}
          className="max-w-full overflow-x-auto overflow-y-hidden"
          onScroll={syncFromTop}
        >
          <div className="h-1" style={{ width: `${contentWidth}px` }} />
        </div>
      </div>
      <div
        ref={bottomScrollRef}
        className="max-w-full overflow-x-auto overflow-y-hidden"
        onScroll={syncFromBottom}
      >
        {children}
      </div>
    </>
  );
}

export function AdminMonthlyViewPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<MonthlyViewTab>("attendance");
  const [hiddenColumnsByTab, setHiddenColumnsByTab] =
    useState<HiddenColumnsByTab>(() => ({
      attendance: new Set(),
      salary: new Set(),
    }));
  const [columnPreferencesHydrated, setColumnPreferencesHydrated] =
    useState(false);
  const hiddenColumnsByTabRef = useRef(hiddenColumnsByTab);
  const [monthValue, setMonthValue] = useState(currentMonthValue);
  const [attendanceScrollDate, setAttendanceScrollDate] = useState<
    string | null
  >(null);
  const attendanceScrollRef = useRef<HTMLDivElement | null>(null);
  const preferenceSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const today = currentDateValue();
  const { month, year } = useMemo(() => toMonthYear(monthValue), [monthValue]);
  const params = useMemo(() => ({ month, year }), [month, year]);
  const { data, isLoading } = useGetMonthlyAdminView(params, {
    query: { queryKey: getGetMonthlyAdminViewQueryKey(params) },
  });
  const serverHiddenColumnsByTab = useMemo<HiddenColumnsByTab>(
    () => ({
      attendance: new Set(data?.columnPreferences.attendance ?? []),
      salary: new Set(data?.columnPreferences.salary ?? []),
    }),
    [data?.columnPreferences.attendance, data?.columnPreferences.salary],
  );
  const effectiveHiddenColumnsByTab = columnPreferencesHydrated
    ? hiddenColumnsByTab
    : serverHiddenColumnsByTab;
  const columnOptions = useMemo<ColumnOption[]>(() => {
    if (tab === "salary") return SALARY_COLUMNS;

    return [
      ...ATTENDANCE_COLUMNS,
      ...(data?.days ?? []).map((day) => {
        const header = dayHeaderLabel(day.date);
        return {
          id: attendanceDayColumnId(day.date),
          label: `${header.shortDay}, ${header.shortDate}`,
        };
      }),
    ];
  }, [data?.days, tab]);
  const hiddenColumnIds = effectiveHiddenColumnsByTab[tab];

  useEffect(() => {
    if (columnPreferencesHydrated || !data?.columnPreferences) return;

    const storedHiddenColumns = {
      attendance: new Set(data.columnPreferences.attendance),
      salary: new Set(data.columnPreferences.salary),
    };
    hiddenColumnsByTabRef.current = storedHiddenColumns;
    setHiddenColumnsByTab(storedHiddenColumns);
    setColumnPreferencesHydrated(true);
  }, [columnPreferencesHydrated, data?.columnPreferences]);

  useEffect(() => {
    if (tab !== "attendance" || !attendanceScrollDate) return;
    if (!(data?.days ?? []).some((day) => day.date === attendanceScrollDate))
      return;

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

  const onDownload = () => {
    if (!data) return;
    downloadMonthlyViewCsv(tab, data, hiddenColumnIds);
  };

  const persistColumnPreferences = (nextHiddenColumns: HiddenColumnsByTab) => {
    const preferences = toColumnPreferences(nextHiddenColumns);

    preferenceSaveQueueRef.current = preferenceSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const savedPreferences = await updateMonthlyViewColumnPreferences(
          preferences,
          { keepalive: true },
        );

        queryClient.setQueriesData<GetMonthlyAdminViewQueryResult>(
          { queryKey: getGetMonthlyAdminViewQueryKey() },
          (current) =>
            current
              ? { ...current, columnPreferences: savedPreferences }
              : current,
        );
      })
      .catch(() => {
        toast.error("Could not save column visibility. Please try again.");
      });
  };

  const onColumnVisibilityChange = (columnId: string, visible: boolean) => {
    const currentHiddenColumns = hiddenColumnsByTabRef.current;
    const hiddenColumns = new Set(currentHiddenColumns[tab]);
    if (visible) {
      hiddenColumns.delete(columnId);
    } else {
      hiddenColumns.add(columnId);
    }

    const nextHiddenColumns = { ...currentHiddenColumns, [tab]: hiddenColumns };
    hiddenColumnsByTabRef.current = nextHiddenColumns;
    setHiddenColumnsByTab(nextHiddenColumns);
    persistColumnPreferences(nextHiddenColumns);
  };

  const onShowAllColumns = () => {
    const nextHiddenColumns = {
      ...hiddenColumnsByTabRef.current,
      [tab]: new Set<string>(),
    };
    hiddenColumnsByTabRef.current = nextHiddenColumns;
    setHiddenColumnsByTab(nextHiddenColumns);
    persistColumnPreferences(nextHiddenColumns);
  };

  const hasDownloadRows =
    tab === "attendance"
      ? (data?.attendance.rows.length ?? 0) > 0
      : (data?.salary.rows.length ?? 0) > 0;

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
              className="w-40 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as MonthlyViewTab)}
        className="min-w-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm">
          <TabsList className="grid h-auto w-full max-w-md grid-cols-2 rounded-2xl bg-slate-100 p-1">
            <TabsTrigger
              value="attendance"
              className="rounded-xl py-3 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Attendance
            </TabsTrigger>
            <TabsTrigger
              value="salary"
              className="rounded-xl py-3 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              Salary
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <ColumnVisibilityMenu
              columns={columnOptions}
              disabled={isLoading || !columnPreferencesHydrated}
              hiddenColumnIds={hiddenColumnIds}
              onShowAll={onShowAllColumns}
              onVisibilityChange={onColumnVisibilityChange}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isLoading || !hasDownloadRows}
              onClick={onDownload}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>
        </div>

        <TabsContent value="attendance" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-lg px-3 py-1 text-sm">
                Whole month attendance grid
              </Badge>
              {data?.attendance?.totalOffDays != null && (
                <Badge
                  variant="secondary"
                  className="rounded-lg px-3 py-1 text-sm"
                >
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
            today={today}
            hiddenColumnIds={effectiveHiddenColumnsByTab.attendance}
          />
        </TabsContent>

        <TabsContent value="salary" className="mt-5">
          <SalarySheet
            data={data}
            isLoading={isLoading}
            hiddenColumnIds={effectiveHiddenColumnsByTab.salary}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttendanceSheet({
  data,
  hiddenColumnIds,
  isLoading,
  scrollContainerRef,
  today,
}: {
  data: GetMonthlyAdminViewQueryResult | undefined;
  hiddenColumnIds: Set<string>;
  isLoading: boolean;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  today: string;
}) {
  const isColumnVisible = (columnId: string) => !hiddenColumnIds.has(columnId);
  const stickyLeft = {
    doj: 0,
    employee: isColumnVisible("doj") ? ATTENDANCE_STICKY_LEFT.employee : 0,
    designation:
      (isColumnVisible("doj") ? ATTENDANCE_STICKY_LEFT.employee : 0) +
      (isColumnVisible("employee")
        ? ATTENDANCE_STICKY_LEFT.designation - ATTENDANCE_STICKY_LEFT.employee
        : 0),
  };
  const visibleColumnCount =
    ATTENDANCE_COLUMNS.reduce(
      (count, column) => count + (isColumnVisible(column.id) ? 1 : 0),
      0,
    ) +
    (data?.days ?? []).reduce(
      (count, day) =>
        count + (isColumnVisible(attendanceDayColumnId(day.date)) ? 1 : 0),
      0,
    );

  return (
    <div className="max-w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <SyncedHorizontalScroll
        label="Attendance table"
        scrollContainerRef={scrollContainerRef}
      >
        <div className="inline-block min-w-full align-top">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  hidden={!isColumnVisible("doj")}
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-600",
                    ATTENDANCE_WIDTHS.doj,
                  )}
                  style={stickyCell(stickyLeft.doj, 43)}
                >
                  DOJ
                </th>
                <th
                  hidden={!isColumnVisible("employee")}
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-600",
                    ATTENDANCE_WIDTHS.employee,
                  )}
                  style={stickyCell(stickyLeft.employee, 42)}
                >
                  Names
                </th>
                <th
                  hidden={!isColumnVisible("designation")}
                  className={cn(
                    "sticky border border-r-2 border-slate-300 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-600 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                    ATTENDANCE_WIDTHS.designation,
                  )}
                  style={stickyCell(stickyLeft.designation, 41)}
                >
                  Designation
                </th>
                <th
                  hidden={!isColumnVisible("probationEnd")}
                  className="min-w-[150px] border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-600"
                >
                  Probation End
                </th>
                <th
                  hidden={!isColumnVisible("status")}
                  className="min-w-[110px] border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-600"
                >
                  Status
                </th>
                <th
                  hidden={!isColumnVisible("annual")}
                  className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Annual
                </th>
                <th
                  hidden={!isColumnVisible("casual")}
                  className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Casual
                </th>
                <th
                  hidden={!isColumnVisible("sick")}
                  className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Sick
                </th>
                <th
                  hidden={!isColumnVisible("absent")}
                  className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Absent
                </th>
                <th
                  hidden={!isColumnVisible("late")}
                  className="min-w-[82px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Late
                </th>
                <th
                  hidden={!isColumnVisible("totalOffs")}
                  className="min-w-[100px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Total Offs
                </th>
                {(data?.days ?? []).map((day) => {
                  const header = dayHeaderLabel(day.date);
                  const isToday = day.date === today;
                  return (
                    <th
                      key={day.date}
                      data-day-date={day.date}
                      hidden={!isColumnVisible(attendanceDayColumnId(day.date))}
                      className={cn(
                        "min-w-[110px] border border-slate-200 px-2 py-2.5 text-center align-top",
                        isToday
                          ? "bg-blue-100 ring-2 ring-inset ring-blue-400"
                          : day.isOffDay
                            ? "bg-amber-50/50"
                            : "bg-slate-50",
                      )}
                    >
                      <div
                        className={cn(
                          "text-sm font-semibold leading-none text-slate-700",
                          isToday && "text-blue-800",
                        )}
                      >
                        {header.shortDay}
                      </div>
                      <div
                        className={cn(
                          "mt-2 text-xs leading-snug text-slate-500",
                          isToday && "font-semibold text-blue-700",
                        )}
                      >
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
                    colSpan={visibleColumnCount}
                    className="border border-slate-200 px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading monthly attendance view...
                  </td>
                </tr>
              ) : (data?.attendance?.rows ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
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
                      hidden={!isColumnVisible("doj")}
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-medium text-slate-800",
                        ATTENDANCE_WIDTHS.doj,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(stickyLeft.doj, 33)}
                    >
                      {formatCompactDate(row.doj)}
                    </td>
                    <td
                      hidden={!isColumnVisible("employee")}
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-900",
                        ATTENDANCE_WIDTHS.employee,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(stickyLeft.employee, 32)}
                    >
                      {row.employeeName}
                    </td>
                    <td
                      hidden={!isColumnVisible("designation")}
                      className={cn(
                        "sticky border border-r-2 border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                        ATTENDANCE_WIDTHS.designation,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(stickyLeft.designation, 31)}
                    >
                      {row.designation || "—"}
                    </td>
                    <td
                      hidden={!isColumnVisible("probationEnd")}
                      className="border border-slate-200 px-3 py-2.5 text-slate-500"
                    >
                      {formatDateShort(row.probationEndDate)}
                    </td>
                    <td
                      hidden={!isColumnVisible("status")}
                      className="border border-slate-200 px-3 py-2.5"
                    >
                      <Badge
                        variant={
                          row.employmentStatus === "left"
                            ? "destructive"
                            : "secondary"
                        }
                        className="rounded-lg"
                      >
                        {row.employmentStatus === "left" ? "Left" : "Active"}
                      </Badge>
                    </td>
                    <td
                      hidden={!isColumnVisible("annual")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-sm text-slate-800"
                    >
                      {row.annualLeaves}
                    </td>
                    <td
                      hidden={!isColumnVisible("casual")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-sm text-slate-800"
                    >
                      {row.casualLeaves}
                    </td>
                    <td
                      hidden={!isColumnVisible("sick")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-sm text-slate-800"
                    >
                      {row.sickLeaves}
                    </td>
                    <td
                      hidden={!isColumnVisible("absent")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-sm text-slate-800"
                    >
                      {row.absentDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("late")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-sm text-slate-800"
                    >
                      {row.lateDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("totalOffs")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-sm text-slate-800"
                    >
                      {row.totalOffDays}
                    </td>
                    {row.dayCells.map((cell) => (
                      <td
                        key={cell.date}
                        hidden={
                          !isColumnVisible(attendanceDayColumnId(cell.date))
                        }
                        className={cn(
                          "border border-slate-200 px-2 py-2 text-center",
                          cell.date === today && "bg-blue-50",
                          cell.isOffDay &&
                            cell.status !== "future" &&
                            "bg-amber-50/30",
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
      </SyncedHorizontalScroll>
    </div>
  );
}

function SalarySheet({
  data,
  hiddenColumnIds,
  isLoading,
}: {
  data: GetMonthlyAdminViewQueryResult | undefined;
  hiddenColumnIds: Set<string>;
  isLoading: boolean;
}) {
  const isColumnVisible = (columnId: string) => !hiddenColumnIds.has(columnId);
  const stickyLeft = {
    doj: 0,
    employee: isColumnVisible("doj") ? SALARY_STICKY_LEFT.employee : 0,
    designation:
      (isColumnVisible("doj") ? SALARY_STICKY_LEFT.employee : 0) +
      (isColumnVisible("employee")
        ? SALARY_STICKY_LEFT.designation - SALARY_STICKY_LEFT.employee
        : 0),
  };
  const visibleColumnCount = SALARY_COLUMNS.reduce(
    (count, column) => count + (isColumnVisible(column.id) ? 1 : 0),
    0,
  );

  return (
    <div className="max-w-full overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <SyncedHorizontalScroll label="Salary table">
        <div className="inline-block min-w-full align-top">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  hidden={!isColumnVisible("doj")}
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-600",
                    SALARY_WIDTHS.doj,
                  )}
                  style={stickyCell(stickyLeft.doj, 43)}
                >
                  DOJ
                </th>
                <th
                  hidden={!isColumnVisible("employee")}
                  className={cn(
                    "sticky border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-600",
                    SALARY_WIDTHS.employee,
                  )}
                  style={stickyCell(stickyLeft.employee, 42)}
                >
                  Names
                </th>
                <th
                  hidden={!isColumnVisible("designation")}
                  className={cn(
                    "sticky border border-r-2 border-slate-300 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-600 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                    SALARY_WIDTHS.designation,
                  )}
                  style={stickyCell(stickyLeft.designation, 41)}
                >
                  Designation
                </th>
                <th
                  hidden={!isColumnVisible("department")}
                  className="min-w-[140px] border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-600"
                >
                  Department
                </th>
                <th
                  hidden={!isColumnVisible("payroll")}
                  className="min-w-[120px] border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-600"
                >
                  Payroll
                </th>
                <th
                  hidden={!isColumnVisible("basic")}
                  className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Basic
                </th>
                <th
                  hidden={!isColumnVisible("allowances")}
                  className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Allowances
                </th>
                <th
                  hidden={!isColumnVisible("gross")}
                  className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Gross
                </th>
                <th
                  hidden={!isColumnVisible("working")}
                  className="min-w-[95px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Working
                </th>
                <th
                  hidden={!isColumnVisible("present")}
                  className="min-w-[90px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Present
                </th>
                <th
                  hidden={!isColumnVisible("paidLeave")}
                  className="min-w-[90px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Paid Leave
                </th>
                <th
                  hidden={!isColumnVisible("absent")}
                  className="min-w-[90px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Absent
                </th>
                <th
                  hidden={!isColumnVisible("late")}
                  className="min-w-[80px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Late
                </th>
                <th
                  hidden={!isColumnVisible("latePenalty")}
                  className="min-w-[120px] border border-slate-200 px-3 py-3 text-center text-sm font-semibold text-slate-600"
                >
                  Late Penalty
                </th>
                <th
                  hidden={!isColumnVisible("bonus")}
                  className="min-w-[110px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Bonus
                </th>
                <th
                  hidden={!isColumnVisible("loanDeduction")}
                  className="min-w-[130px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Loan Deduction
                </th>
                <th
                  hidden={!isColumnVisible("otherDeductions")}
                  className="min-w-[140px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Other Deductions
                </th>
                <th
                  hidden={!isColumnVisible("tax")}
                  className="min-w-[100px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Tax
                </th>
                <th
                  hidden={!isColumnVisible("netSalary")}
                  className="min-w-[120px] border border-slate-200 px-4 py-3 text-right text-sm font-semibold text-slate-600"
                >
                  Net Salary
                </th>
                <th
                  hidden={!isColumnVisible("generated")}
                  className="min-w-[150px] border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-600"
                >
                  Generated
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
                    className="border border-slate-200 px-4 py-12 text-center text-muted-foreground"
                  >
                    Loading monthly salary view...
                  </td>
                </tr>
              ) : (data?.salary?.rows ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumnCount}
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
                      hidden={!isColumnVisible("doj")}
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-medium text-slate-800",
                        SALARY_WIDTHS.doj,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(stickyLeft.doj, 33)}
                    >
                      {formatCompactDate(row.doj)}
                    </td>
                    <td
                      hidden={!isColumnVisible("employee")}
                      className={cn(
                        "sticky border border-slate-200 bg-white px-3 py-2.5 font-semibold text-slate-900",
                        SALARY_WIDTHS.employee,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(stickyLeft.employee, 32)}
                    >
                      {row.employeeName}
                    </td>
                    <td
                      hidden={!isColumnVisible("designation")}
                      className={cn(
                        "sticky border border-r-2 border-slate-300 bg-white px-3 py-2.5 text-slate-800 shadow-[8px_0_12px_-10px_rgba(15,23,42,0.18)]",
                        SALARY_WIDTHS.designation,
                        row.employmentStatus === "left" && "bg-rose-50/50",
                      )}
                      style={stickyCell(stickyLeft.designation, 31)}
                    >
                      {row.designation || "—"}
                    </td>
                    <td
                      hidden={!isColumnVisible("department")}
                      className="border border-slate-200 px-3 py-2.5 text-slate-800"
                    >
                      {row.department || "—"}
                    </td>
                    <td
                      hidden={!isColumnVisible("payroll")}
                      className="border border-slate-200 px-3 py-2.5"
                    >
                      <Badge
                        variant={
                          row.payrollStatus === "generated"
                            ? "secondary"
                            : "outline"
                        }
                        className="rounded-lg"
                      >
                        {row.payrollStatus === "generated"
                          ? "Generated"
                          : "Pending"}
                      </Badge>
                    </td>
                    <td
                      hidden={!isColumnVisible("basic")}
                      className="border border-slate-200 px-3 py-2.5 text-right text-slate-800"
                    >
                      {formatCurrency(row.basicSalary)}
                    </td>
                    <td
                      hidden={!isColumnVisible("allowances")}
                      className="border border-slate-200 px-3 py-2.5 text-right text-slate-800"
                    >
                      {formatCurrency(row.allowances)}
                    </td>
                    <td
                      hidden={!isColumnVisible("gross")}
                      className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-900"
                    >
                      {formatCurrency(row.grossSalary)}
                    </td>
                    <td
                      hidden={!isColumnVisible("working")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-slate-800"
                    >
                      {row.totalWorkingDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("present")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-slate-800"
                    >
                      {row.presentDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("paidLeave")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-slate-800"
                    >
                      {row.paidLeaveDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("absent")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-slate-800"
                    >
                      {row.absentDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("late")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-slate-800"
                    >
                      {row.lateCount}
                    </td>
                    <td
                      hidden={!isColumnVisible("latePenalty")}
                      className="border border-slate-200 px-2 py-2.5 text-center text-slate-800"
                    >
                      {row.latePenaltyDays}
                    </td>
                    <td
                      hidden={!isColumnVisible("bonus")}
                      className="border border-slate-200 px-3 py-2.5 text-right text-slate-800"
                    >
                      {formatCurrency(row.bonus)}
                    </td>
                    <td
                      hidden={!isColumnVisible("loanDeduction")}
                      className="border border-slate-200 px-3 py-2.5 text-right text-slate-800"
                    >
                      {formatCurrency(row.loanDeduction)}
                    </td>
                    <td
                      hidden={!isColumnVisible("otherDeductions")}
                      className="border border-slate-200 px-3 py-2.5 text-right text-slate-800"
                    >
                      {formatCurrency(row.otherDeductions)}
                    </td>
                    <td
                      hidden={!isColumnVisible("tax")}
                      className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-rose-600"
                    >
                      {formatCurrency(row.payrollTax)}
                    </td>
                    <td
                      hidden={!isColumnVisible("netSalary")}
                      className="border border-slate-200 px-3 py-2.5 text-right font-semibold text-slate-900"
                    >
                      {formatCurrency(row.netSalary)}
                    </td>
                    <td
                      hidden={!isColumnVisible("generated")}
                      className="border border-slate-200 px-3 py-2.5 text-slate-500"
                    >
                      {row.generatedAt
                        ? formatDateShort(row.generatedAt)
                        : "Not generated"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SyncedHorizontalScroll>
    </div>
  );
}
