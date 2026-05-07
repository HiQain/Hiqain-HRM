import { useMemo, useState } from "react";
import {
  useGetMyAttendance,
  useGetAttendanceCalendar,
  useGetEmployeeDashboard,
  useGetSettings,
  getGetMyAttendanceQueryKey,
  getGetAttendanceCalendarQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import type { AttendanceRecord } from "@workspace/api-client-react";
import type { AttendanceCalendarDay } from "@workspace/api-client-react";
import { CheckCircle2, Clock, XCircle, Plane, ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AttendanceRuleHint } from "@/components/AttendanceRuleHint";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, formatDuration, formatTime } from "@/lib/utils";
import {
  buildScheduledHoursTargets,
  normalizeAttendanceWorkedMinutes,
} from "@/lib/attendanceHours";

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On Leave" },
  { value: "half_day", label: "Half Day" },
  { value: "remote_work", label: "Remote Work" },
] as const;

const DAY_BG: Record<string, string> = {
  present: "bg-emerald-50 border-emerald-200",
  late: "bg-amber-50 border-amber-200",
  absent: "bg-rose-50 border-rose-200",
  on_leave: "bg-sky-50 border-sky-200",
  half_day:
    "border-purple-200 bg-[linear-gradient(135deg,#faf5ff_0%,#faf5ff_50%,#e9d5ff_50%,#e9d5ff_100%)]",
  remote_work: "bg-teal-50 border-teal-200",
  weekend: "bg-slate-50 border-slate-200 text-slate-400",
  future: "bg-white border-dashed border-slate-200 text-slate-300",
  none: "bg-white border-dashed border-slate-200 text-slate-300",
};

function resolveWorkedMinutes(record: {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  workedMinutes?: number | null;
  pausedMinutes?: number | null;
  pausedAt?: string | null;
}) {
  if (!record.checkInTime || record.checkOutTime) {
    return record.workedMinutes ?? 0;
  }
  const now = Date.now();
  const activePauseMinutes = record.pausedAt
    ? Math.max(0, Math.floor((now - new Date(record.pausedAt).getTime()) / 60000))
    : 0;
  return Math.max(
    0,
    Math.floor((now - new Date(record.checkInTime).getTime()) / 60000) -
      (record.pausedMinutes ?? 0) -
      activePauseMinutes,
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1, 1));
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function MyAttendancePage() {
  const now = new Date();
  const [month, setMonth] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [view, setView] = useState<"list" | "calendar">("list");

  const { data, isLoading } = useGetMyAttendance(
    { month },
    { query: { queryKey: getGetMyAttendanceQueryKey({ month }) } },
  );
  const { data: dashboard } = useGetEmployeeDashboard();
  const employeeId = dashboard?.employee.id ?? 0;
  const calendarParams = { employeeId, month };
  const { data: calendar } = useGetAttendanceCalendar(calendarParams, {
    query: {
      queryKey: getGetAttendanceCalendarQueryKey(calendarParams),
      enabled: employeeId > 0,
    },
  });

  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="See your check-ins, check-outs and worked hours by month."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={view} onValueChange={(v) => setView(v as "list" | "calendar")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="list">List view</SelectItem>
                <SelectItem value="calendar">Calendar view</SelectItem>
              </SelectContent>
            </Select>
            {view === "list" ? (
              <Input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-44"
              />
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[140px] text-center text-sm font-semibold">
                  {monthLabel(month)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        }
      />

      <AttendanceStats
        records={data ?? []}
        calendarDays={calendar?.days ?? []}
        officeStartTime={dashboard?.employee.officeStartTime}
        officeEndTime={dashboard?.employee.officeEndTime}
        weeklyOffDays={settings?.weeklyOffDays ?? [0, 6]}
        publicHolidays={
          (settings?.publicHolidays ?? []).map((holiday) => holiday.date as unknown as string)
        }
        month={month}
      />
      <AttendanceRuleHint />

      {view === "list" ? (
        <ListView
          data={data}
          calendarDays={calendar?.days}
          officeStartTime={dashboard?.employee.officeStartTime}
          officeEndTime={dashboard?.employee.officeEndTime}
          isLoading={isLoading}
        />
      ) : (
        <CalendarView calendar={calendar} />
      )}
    </div>
  );
}

export function AttendanceStats({
  records,
  calendarDays,
  officeStartTime,
  officeEndTime,
  weeklyOffDays,
  publicHolidays,
  month,
}: {
  records: AttendanceRecord[];
  calendarDays?: AttendanceCalendarDay[];
  officeStartTime?: string | null;
  officeEndTime?: string | null;
  weeklyOffDays: number[];
  publicHolidays: string[];
  month: string;
}) {
  const summary = useMemo(() => {
    const s = {
      present: 0,
      late: 0,
      absent: 0,
      on_leave: 0,
      monthMinutes: 0,
      weekMinutes: 0,
    };
    const now = new Date();
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = (day + 6) % 7; // Monday-based week
    startOfWeek.setDate(startOfWeek.getDate() - diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const source =
      calendarDays && calendarDays.length > 0
        ? calendarDays
            .filter((day) =>
              ["present", "late", "absent", "on_leave", "half_day", "remote_work"].includes(
                day.status,
              ),
            )
            .map((day) =>
              day.record
                ? {
                    ...day.record,
                    workedMinutes: normalizeAttendanceWorkedMinutes({
                      status: day.status,
                      workedMinutes: resolveWorkedMinutes(day.record),
                      officeStartTime,
                      officeEndTime,
                    }),
                  }
                : {
                    date: day.date,
                    status: day.status,
                    workedMinutes: normalizeAttendanceWorkedMinutes({
                      status: day.status,
                      workedMinutes: 0,
                      officeStartTime,
                      officeEndTime,
                    }),
                  },
            )
        : records;

    for (const r of source) {
      if (r.status === "present" || r.status === "remote_work" || r.status === "half_day") {
        s.present += 1;
      } else if (r.status === "late") s.late += 1;
      else if (r.status === "on_leave") s.on_leave += 1;
      else s.absent += 1;
      const minutes = r.workedMinutes ?? 0;
      s.monthMinutes += minutes;
      const d = new Date(r.date);
      if (d >= startOfWeek && d <= now) s.weekMinutes += minutes;
    }
    return s;
  }, [calendarDays, officeEndTime, officeStartTime, records]);

  const targets = useMemo(
    () =>
      buildScheduledHoursTargets({
        officeStartTime,
        officeEndTime,
        offDays: weeklyOffDays,
        holidayDates: new Set(publicHolidays),
        month,
      }),
    [month, officeEndTime, officeStartTime, publicHolidays, weeklyOffDays],
  );

  const weekHours = (summary.weekMinutes / 60).toFixed(1);
  const monthHours = (summary.monthMinutes / 60).toFixed(1);
  const weekTarget = targets.weekly;
  const monthTarget = targets.monthly;
  const weekValue = weekTarget > 0 ? `${weekHours} / ${weekTarget} h` : `${weekHours} h`;
  const monthValue = monthTarget > 0 ? `${monthHours} / ${monthTarget} h` : `${monthHours} h`;
  const weekPct =
    weekTarget > 0
      ? Math.min(
          100,
          Math.round((summary.weekMinutes / (weekTarget * 60)) * 100),
        )
      : null;
  const monthPct =
    monthTarget > 0
      ? Math.min(
          100,
          Math.round((summary.monthMinutes / (monthTarget * 60)) * 100),
        )
      : null;

  return (
    <>
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
    </>
  );
}

function ListView({
  data,
  calendarDays,
  officeStartTime,
  officeEndTime,
  isLoading,
}: {
  data: AttendanceRecord[] | undefined;
  calendarDays: AttendanceCalendarDay[] | undefined;
  officeStartTime?: string | null;
  officeEndTime?: string | null;
  isLoading: boolean;
}) {
  const rows = useMemo(() => {
    if (calendarDays?.length) {
      return calendarDays
        .filter((day) =>
          ["present", "late", "absent", "on_leave", "half_day", "remote_work"].includes(
            day.status,
          ),
        )
        .map((day) => ({
          id: day.record?.id ?? day.date,
          date: day.date,
          status: day.status,
          checkInTime: day.record?.checkInTime ?? null,
          checkOutTime: day.record?.checkOutTime ?? null,
          workedMinutes: normalizeAttendanceWorkedMinutes({
            status: day.status,
            workedMinutes: day.record ? resolveWorkedMinutes(day.record) : null,
            officeStartTime,
            officeEndTime,
          }),
        }));
    }
    return (data ?? []).map((record) => ({
      ...record,
      workedMinutes: normalizeAttendanceWorkedMinutes({
        status: record.status,
        workedMinutes: resolveWorkedMinutes(record),
        officeStartTime,
        officeEndTime,
      }),
    }));
  }, [calendarDays, data, officeEndTime, officeStartTime]);

  return (
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
              <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                No records for this month yet.
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
  );
}

function CalendarView({
  calendar,
}: {
  calendar:
    | {
        month: string;
        days: AttendanceCalendarDay[];
      }
    | undefined;
}) {
  const monthGrid = useMemo(() => {
    if (!calendar) return [] as Array<{ date: string; status: string } | null>;
    const [y, m] = calendar.month.split("-").map(Number);
    const firstDow = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
    const cells: Array<typeof calendar.days[number] | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (const d of calendar.days) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendar]);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 grid grid-cols-7 text-center text-xs font-semibold uppercase text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>

      {!calendar ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-md" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {monthGrid.map((cell, i) => {
            if (!cell)
              return <div key={`empty-${i}`} className="h-24 rounded-md" />;
            const day = Number(cell.date.slice(-2));
            return (
              <div
                key={cell.date}
                className={cn(
                  "flex h-24 flex-col items-start justify-between rounded-md border p-2 text-left",
                  DAY_BG[cell.status] ?? "bg-white border-slate-200",
                )}
              >
                <span className="text-sm font-semibold">{day}</span>
                {cell.status !== "weekend" &&
                  cell.status !== "future" &&
                  cell.status !== "none" && (
                    <StatusBadge
                      status={cell.status}
                      className="self-stretch justify-center !text-[10px] !px-1.5 !py-0"
                    />
                  )}
                {cell.status === "weekend" && (
                  <span className="text-[10px] uppercase text-slate-400">Weekend</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-xs">
        {STATUS_OPTIONS.map((s) => (
          <StatusBadge key={s.value} status={s.value} />
        ))}
        <StatusBadge status="weekend" />
      </div>
    </div>
  );
}
