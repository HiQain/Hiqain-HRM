import { useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Plane, XCircle } from "lucide-react";
import {
  useListEmployees,
  useGetAttendanceCalendar,
  useGetEmployeeAttendance,
  useOverrideAttendance,
  getGetAttendanceCalendarQueryKey,
  getGetEmployeeAttendanceQueryKey,
  type AttendanceOverrideRequestStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { AttendanceRuleHint } from "@/components/AttendanceRuleHint";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cn,
  formatDate,
  formatDateLong,
  formatDuration,
  formatHM12,
  formatTime,
} from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On Leave" },
  { value: "half_day", label: "Half Day" },
  { value: "remote_work", label: "Remote Work" },
] as const;

const DAY_BG: Record<string, string> = {
  present: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
  late: "bg-amber-50 hover:bg-amber-100 border-amber-200",
  absent: "bg-rose-50 hover:bg-rose-100 border-rose-200",
  on_leave: "bg-sky-50 hover:bg-sky-100 border-sky-200",
  half_day:
    "border-purple-200 hover:border-purple-300 bg-[linear-gradient(135deg,#faf5ff_0%,#faf5ff_50%,#e9d5ff_50%,#e9d5ff_100%)] hover:bg-[linear-gradient(135deg,#f5edff_0%,#f5edff_50%,#ddc7ff_50%,#ddc7ff_100%)]",
  remote_work: "bg-teal-50 hover:bg-teal-100 border-teal-200",
  weekend: "bg-slate-50 border-slate-200 text-slate-400",
  holiday: "bg-indigo-50 hover:bg-indigo-100 border-indigo-300 text-indigo-600",
  future: "bg-white border-dashed border-slate-200 text-slate-300",
  none: "bg-white border-dashed border-slate-200 text-slate-300",
};

function isLockedAttendanceStatus(status: string) {
  return ["weekend", "holiday", "future", "none"].includes(status);
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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

function officeMinutes(
  officeStartTime?: string | null,
  officeEndTime?: string | null,
  breakMinutes?: number | null,
) {
  if (!officeStartTime || !officeEndTime) return 0;
  const [startHour, startMinute] = officeStartTime.split(":").map(Number);
  const [endHour, endMinute] = officeEndTime.split(":").map(Number);
  const start = (startHour ?? 0) * 60 + (startMinute ?? 0);
  const end = (endHour ?? 0) * 60 + (endMinute ?? 0);
  const span = end <= start ? 24 * 60 - start + end : end - start;
  return Math.max(0, span - Math.max(0, breakMinutes ?? 0));
}

function resolveAttendanceDisplay(
  row: {
    status: string;
    checkInTime?: string | null;
    checkOutTime?: string | null;
    workedMinutes?: number | null;
  },
  officeStartTime?: string | null,
  officeEndTime?: string | null,
  breakMinutes?: number | null,
) {
  const fullShiftMinutes = officeMinutes(
    officeStartTime,
    officeEndTime,
    breakMinutes,
  );
  const shouldBackfill =
    ["present", "on_leave", "remote_work"].includes(row.status) &&
    !row.checkInTime &&
    !row.checkOutTime;

  return {
    checkIn: row.checkInTime
      ? formatTime(row.checkInTime)
      : shouldBackfill
        ? formatHM12(officeStartTime)
        : "—",
    checkOut: row.checkOutTime
      ? formatTime(row.checkOutTime)
      : shouldBackfill
        ? formatHM12(officeEndTime)
        : "—",
    worked:
      row.workedMinutes && row.workedMinutes > 0
        ? formatDuration(row.workedMinutes)
        : shouldBackfill && fullShiftMinutes > 0
          ? formatDuration(fullShiftMinutes)
          : "—",
  };
}

export function AdminAttendanceCalendarPage() {
  const { data: employees, isLoading: empLoading } = useListEmployees();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [month, setMonth] = useState<string>(thisMonth());
  const [view, setView] = useState<"list" | "calendar">("calendar");

  const effectiveEmployeeId =
    employeeId ?? (employees && employees[0] ? employees[0].id : null);
  const selectedEmployee =
    employees?.find((employee) => employee.id === effectiveEmployeeId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="View and override attendance for any employee, day by day."
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
          </div>
        }
      />

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              Employee
            </span>
            {empLoading ? (
              <Skeleton className="h-9 w-56" />
            ) : (
              <Select
                value={String(effectiveEmployeeId ?? "")}
                onValueChange={(v) => setEmployeeId(Number(v))}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                      {e.positionType === "remote" ? " · Remote" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {view === "calendar" ? (
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMonth(thisMonth())}
              >
                Today
              </Button>
            </div>
          ) : (
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-44"
            />
          )}
        </div>
        <AttendanceRuleHint
          officeStartTime={selectedEmployee?.officeStartTime}
          gracePeriodMinutes={selectedEmployee?.gracePeriodMinutes}
          className="mt-3"
        />
      </div>

      {view === "calendar" ? (
        <CalendarView employeeId={effectiveEmployeeId} month={month} />
      ) : (
        <ListView
          employeeId={effectiveEmployeeId}
          month={month}
          officeStartTime={selectedEmployee?.officeStartTime}
          officeEndTime={selectedEmployee?.officeEndTime}
          breakMinutes={selectedEmployee?.breakMinutes}
        />
      )}
    </div>
  );
}

function ListView({
  employeeId,
  month,
  officeStartTime,
  officeEndTime,
  breakMinutes,
}: {
  employeeId: number | null;
  month: string;
  officeStartTime?: string | null;
  officeEndTime?: string | null;
  breakMinutes?: number | null;
}) {
  const qc = useQueryClient();
  const override = useOverrideAttendance();
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const params = { month };
  const calendarParams = { employeeId: employeeId ?? 0, month };
  const { data, isLoading } = useGetEmployeeAttendance(employeeId ?? 0, params, {
    query: {
      queryKey: getGetEmployeeAttendanceQueryKey(employeeId ?? 0, params),
      enabled: !!employeeId,
    },
  });
  const { data: calendar, isLoading: calendarLoading } = useGetAttendanceCalendar(
    calendarParams,
    {
      query: {
        queryKey: getGetAttendanceCalendarQueryKey(calendarParams),
        enabled: !!employeeId,
      },
    },
  );

  const rows = useMemo(() => {
    return (calendar?.days ?? [])
      .filter((day) => !["future", "weekend", "none"].includes(day.status))
      .map((day) => day.record ?? {
        id: Number(day.date.replaceAll("-", "")),
        employeeId: employeeId ?? 0,
        employeeName: calendar?.employeeName ?? "",
        date: day.date,
        checkInTime: null,
        checkOutTime: null,
        workedMinutes: 0,
        status: day.status,
        isLate: false,
        excused: false,
        notes: null,
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [calendar, employeeId]);

  const summary = useMemo(() => {
    const s = { present: 0, late: 0, absent: 0, on_leave: 0 };
    for (const r of rows) {
      if (r.status === "present") s.present += 1;
      else if (r.status === "late") s.late += 1;
      else if (r.status === "on_leave") s.on_leave += 1;
      else if (r.status === "remote_work") s.present += 1;
      else if (r.status === "half_day") s.present += 0.5;
      else s.absent += 1;
    }
    return s;
  }, [rows]);

  const handleStatusChange = (
    rowKey: string,
    date: string,
    newStatus: AttendanceOverrideRequestStatus,
  ) => {
    if (!employeeId) return;
    setEditingRowKey(rowKey);
    override.mutate(
      {
        data: {
          employeeId,
          date,
          status: newStatus,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Attendance updated");
          await Promise.all([
            qc.invalidateQueries({
              queryKey: getGetEmployeeAttendanceQueryKey(employeeId, params),
            }),
            qc.invalidateQueries({
              queryKey: getGetAttendanceCalendarQueryKey(calendarParams),
            }),
          ]);
          setEditingRowKey(null);
        },
        onError: () => {
          toast.error("Could not update attendance");
          setEditingRowKey(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Present"
          value={summary.present + summary.late}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard label="Late" value={summary.late} icon={Clock} tone="warning" />
        <StatCard label="Absent" value={summary.absent} icon={XCircle} tone="danger" />
        <StatCard
          label="On leave"
          value={summary.on_leave}
          icon={Plane}
          tone="info"
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Change status</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead className="text-right">Worked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!employeeId ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Select an employee to view attendance.
                </TableCell>
              </TableRow>
            ) : isLoading || calendarLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No records for this month.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                (() => {
                  const display = resolveAttendanceDisplay(
                    r,
                    officeStartTime,
                    officeEndTime,
                    breakMinutes,
                  );
                  const isLockedStatus = isLockedAttendanceStatus(r.status);
                  return (
                    <TableRow key={`${r.date}-${r.id}`}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        {isLockedStatus ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <Select
                            value={r.status}
                            onValueChange={(value) =>
                              handleStatusChange(
                                `${r.date}-${r.id}`,
                                r.date,
                                value as AttendanceOverrideRequestStatus,
                              )
                            }
                            disabled={editingRowKey === `${r.date}-${r.id}` && override.isPending}
                          >
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>{display.checkIn}</TableCell>
                      <TableCell>{display.checkOut}</TableCell>
                      <TableCell className="text-right">{display.worked}</TableCell>
                    </TableRow>
                  );
                })()
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CalendarView({
  employeeId,
  month,
}: {
  employeeId: number | null;
  month: string;
}) {
  const calendarParams = { employeeId: employeeId ?? 0, month };
  const { data: calendar, isLoading: calLoading } = useGetAttendanceCalendar(
    calendarParams,
    {
      query: {
        queryKey: getGetAttendanceCalendarQueryKey(calendarParams),
        enabled: !!employeeId,
      },
    },
  );

  const qc = useQueryClient();
  const override = useOverrideAttendance();

  const [editing, setEditing] = useState<{ date: string; status: string } | null>(null);
  const [editStatus, setEditStatus] = useState<string>("present");

  const monthGrid = useMemo(() => {
    if (!calendar) return [];
    const [y, m] = calendar.month.split("-").map(Number);
    const firstDow = new Date(Date.UTC(y!, m! - 1, 1)).getUTCDay();
    const cells: Array<typeof calendar.days[number] | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (const d of calendar.days) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendar]);

  const handleSubmitOverride = () => {
    if (!editing || !employeeId) return;
    override.mutate(
      {
        data: {
          employeeId,
          date: editing.date,
          status: editStatus as AttendanceOverrideRequestStatus,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Attendance updated");
          await qc.invalidateQueries({
            queryKey: getGetAttendanceCalendarQueryKey({ employeeId, month }),
          });
          await qc.invalidateQueries({
            queryKey: getGetEmployeeAttendanceQueryKey(employeeId, { month }),
          });
          setEditing(null);
        },
        onError: () => toast.error("Could not update attendance"),
      },
    );
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 grid grid-cols-7 text-center text-xs font-semibold uppercase text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>

        {!employeeId ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Select an employee to view their calendar.
          </div>
        ) : calLoading || !calendar ? (
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
              const cellStatus = String(cell.status);
              const editable = !isLockedAttendanceStatus(cellStatus);
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={!editable}
                  onClick={() => {
                    if (!editable) return;
                    setEditing({ date: cell.date, status: cell.status });
                    setEditStatus(
                      isLockedAttendanceStatus(cellStatus)
                        ? "present"
                        : cell.status,
                    );
                  }}
                  className={cn(
                    "flex h-24 flex-col items-start justify-between rounded-md border p-2 text-left transition",
                    DAY_BG[cellStatus] ?? "bg-white border-slate-200",
                    editable
                      ? "cursor-pointer"
                      : "cursor-default opacity-60",
                  )}
                >
                  <span className="text-sm font-semibold">{day}</span>
                  {cellStatus !== "weekend" &&
                    cellStatus !== "holiday" &&
                    cellStatus !== "future" &&
                    cellStatus !== "none" && (
                      <StatusBadge
                        status={cell.status}
                        className="self-stretch justify-center !text-[10px] !px-1.5 !py-0"
                      />
                    )}
                  {cellStatus === "weekend" && (
                    <span className="text-[10px] uppercase text-slate-400">
                      Weekend
                    </span>
                  )}
                  {cellStatus === "holiday" && (
                    <span className="text-[10px] uppercase text-indigo-500">
                      Holiday
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-xs">
          {STATUS_OPTIONS.map((s) => (
            <StatusBadge key={s.value} status={s.value} />
          ))}
          <StatusBadge status="weekend" />
          <StatusBadge status="holiday" />
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override attendance</DialogTitle>
            <DialogDescription>
              {editing ? formatDateLong(editing.date) : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Status</label>
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitOverride}
              disabled={override.isPending}
            >
              {override.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
