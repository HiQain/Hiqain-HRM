import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Plane,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import {
  useGetTodayAttendanceSummary,
  getGetTodayAttendanceSummaryQueryKey,
  useListEmployees,
  useOverrideAttendance,
  type AttendanceOverrideRequestStatus,
} from "@workspace/api-client-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";
import { AttendanceRuleHint } from "@/components/AttendanceRuleHint";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { DateField } from "@/components/DateField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  formatDateLong,
  formatDuration,
  formatHM12,
  formatTime,
  ymdLocal,
} from "@/lib/utils";

type StatusFilter = "all" | "absent" | "leave" | "late";

function shiftDate(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
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
    notes?: string | null;
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

function isLockedAttendanceStatus(status: string) {
  return ["weekend", "holiday", "future", "none"].includes(status);
}

export function AdminAttendancePage() {
  const localToday = ymdLocal(new Date());
  const { data: employees } = useListEmployees();
  const [date, setDate] = useState<string | undefined>(undefined);
  const [todayAnchor, setTodayAnchor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [sortByJoiningDate, setSortByJoiningDate] = useState(false);

  const params = date ? { date } : undefined;
  const { data, isLoading } = useGetTodayAttendanceSummary(params, {
    query: { queryKey: getGetTodayAttendanceSummaryQueryKey(params) },
  });

  useEffect(() => {
    if (!data?.date) return;
    if (!todayAnchor) {
      setTodayAnchor(data.date);
    }
    if (!date) {
      setDate(data.date);
    }
  }, [data?.date, date, todayAnchor]);

  const qc = useQueryClient();
  const override = useOverrideAttendance();
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);
  const effectiveDate = date ?? data?.date ?? localToday;
  const operationalToday = todayAnchor ?? data?.date ?? localToday;

  const handleStatusChange = (
    employeeId: number,
    newStatus: AttendanceOverrideRequestStatus,
  ) => {
    setEditingEmpId(employeeId);
    override.mutate(
      { data: { employeeId, date: effectiveDate, status: newStatus } },
      {
        onSuccess: async () => {
          toast.success("Attendance updated");
          await qc.invalidateQueries({
            queryKey: getGetTodayAttendanceSummaryQueryKey(params),
          });
          setEditingEmpId(null);
        },
        onError: () => {
          toast.error("Could not update attendance");
          setEditingEmpId(null);
        },
      },
    );
  };

  const isToday = effectiveDate === operationalToday;
  const isPast = effectiveDate < operationalToday;
  const employeeMeta = useMemo(
    () =>
      new Map(
        (employees ?? []).map((employee) => [
          employee.id,
          {
            department: employee.department ?? "",
            joiningDate: employee.joiningDate ?? "",
            employeeCode: employee.employeeCode ?? "",
            officeStartTime: employee.officeStartTime ?? null,
            officeEndTime: employee.officeEndTime ?? null,
            breakMinutes: employee.breakMinutes ?? 0,
          },
        ]),
      ),
    [employees],
  );
  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          (employees ?? [])
            .map((employee) => employee.department?.trim())
            .filter((department): department is string => Boolean(department)),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [employees],
  );

  const filtered = useMemo(() => {
    if (!data?.records) return [];
    let list = data.records;
    if (statusFilter !== "all") {
      list = list.filter((r) => {
        if (statusFilter === "absent") return r.status === "absent";
        if (statusFilter === "leave") return r.status === "on_leave";
        if (statusFilter === "late") return r.status === "late" || r.isLate;
        return true;
      });
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.employeeName ?? "").toLowerCase().includes(q),
      );
    }
    if (departmentFilter !== "all") {
      list = list.filter(
        (record) =>
          employeeMeta.get(record.employeeId)?.department === departmentFilter,
      );
    }
    return [...list].sort((a, b) => {
      const aMeta = employeeMeta.get(a.employeeId);
      const bMeta = employeeMeta.get(b.employeeId);
      if (sortByJoiningDate) {
        const joiningCompare = (aMeta?.joiningDate ?? "").localeCompare(
          bMeta?.joiningDate ?? "",
        );
        if (joiningCompare !== 0) return joiningCompare;
      }
      const codeCompare = (aMeta?.employeeCode ?? "").localeCompare(
        bMeta?.employeeCode ?? "",
        undefined,
        { numeric: true, sensitivity: "base" },
      );
      if (codeCompare !== 0) return codeCompare;
      return (a.employeeName ?? "").localeCompare(b.employeeName ?? "");
    });
  }, [
    data,
    search,
    statusFilter,
    departmentFilter,
    sortByJoiningDate,
    employeeMeta,
  ]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter !== "all" ||
    departmentFilter !== "all" ||
    sortByJoiningDate;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Today's Attendance"
        description={data ? formatDateLong(data.date) : "Loading..."}
      />
      <AttendanceRuleHint />

      {/* Date navigator */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => setDate((d) => shiftDate(d ?? effectiveDate, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="w-[220px]">
          <DateField value={effectiveDate} onChange={setDate} />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d ?? effectiveDate, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isToday && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDate(operationalToday)}
            className="ml-1"
          >
            <CalendarDays className="mr-1.5 h-4 w-4" />
            Jump to today
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {isToday ? "Showing today" : isPast ? "Past date" : "Future date"}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))
        ) : (
          <>
            <StatCard label="Present" value={data.present} icon={CheckCircle2} tone="success" />
            <StatCard label="Late" value={data.late} icon={Clock} tone="warning" />
            <StatCard label="Absent" value={data.absent} icon={XCircle} tone="danger" />
            <StatCard label="On leave" value={data.onLeave} icon={Plane} tone="info" />
          </>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="grid w-full gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee..."
                className="pl-9"
              />
            </div>
            <Select
              value={departmentFilter}
              onValueChange={setDepartmentFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department} value={department}>
                    {department}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={sortByJoiningDate ? "default" : "outline"}
              onClick={() => setSortByJoiningDate((current) => !current)}
            >
              Date of joining
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={!hasActiveFilters}
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setDepartmentFilter("all");
                setSortByJoiningDate(false);
              }}
            >
              Clear filters
            </Button>
          </div>
          <div className="flex flex-nowrap items-center gap-2 self-start overflow-x-auto 2xl:self-auto">
            <FilterChip
              label="All"
              active={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
            />
            <FilterChip
              label="Absent"
              active={statusFilter === "absent"}
              onClick={() =>
                setStatusFilter((s) => (s === "absent" ? "all" : "absent"))
              }
            />
            <FilterChip
              label="Leave"
              active={statusFilter === "leave"}
              onClick={() =>
                setStatusFilter((s) => (s === "leave" ? "all" : "leave"))
              }
            />
            <FilterChip
              label="Late"
              active={statusFilter === "late"}
              onClick={() =>
                setStatusFilter((s) => (s === "late" ? "all" : "late"))
              }
            />
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Change status</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead>Check-out</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Worked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading attendance...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No matching employees.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const isSaving =
                  editingEmpId === r.employeeId && override.isPending;
                const meta = employeeMeta.get(r.employeeId);
                const display = resolveAttendanceDisplay(
                  r,
                  meta?.officeStartTime,
                  meta?.officeEndTime,
                  meta?.breakMinutes,
                );
                const isLockedStatus = isLockedAttendanceStatus(r.status);
                return (
                  <TableRow key={`${r.employeeId}-${r.date}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar name={r.employeeName} size="sm" />
                        <span className="font-medium">{r.employeeName}</span>
                        {r.excused && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Excused
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>
                      {isLockedStatus ? (
                        <span className="text-sm text-muted-foreground">—</span>
                      ) : (
                        <Select
                          value={r.status}
                          onValueChange={(v) =>
                            handleStatusChange(
                              r.employeeId,
                              v as AttendanceOverrideRequestStatus,
                            )
                          }
                          disabled={isSaving}
                        >
                          <SelectTrigger className="h-8 w-[160px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="on_leave">On leave</SelectItem>
                            <SelectItem value="half_day">Half day</SelectItem>
                            <SelectItem value="remote_work">Remote work</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>{display.checkIn}</TableCell>
                    <TableCell>{display.checkOut}</TableCell>
                    <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                      {r.notes?.trim() || "—"}
                    </TableCell>
                    <TableCell className="text-right">{display.worked}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
