import { useMemo, useState } from "react";
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
import { cn, formatDateLong, formatTime, ymdLocal } from "@/lib/utils";

type StatusFilter = "all" | "absent" | "leave" | "late";

function shiftDate(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + days);
  return ymdLocal(d);
}

export function AdminAttendancePage() {
  const today = ymdLocal(new Date());
  const [date, setDate] = useState<string>(today);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const params = { date };
  const { data, isLoading } = useGetTodayAttendanceSummary(params, {
    query: { queryKey: getGetTodayAttendanceSummaryQueryKey(params) },
  });

  const qc = useQueryClient();
  const override = useOverrideAttendance();
  const [editingEmpId, setEditingEmpId] = useState<number | null>(null);

  const handleStatusChange = (
    employeeId: number,
    newStatus: AttendanceOverrideRequestStatus,
  ) => {
    setEditingEmpId(employeeId);
    override.mutate(
      { data: { employeeId, date, status: newStatus } },
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

  const isToday = date === today;
  const isPast = date < today;

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
    return list;
  }, [data, search, statusFilter]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Today's Attendance"
        description={data ? formatDateLong(data.date) : "Loading..."}
      />

      {/* Date navigator */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous day"
          onClick={() => setDate((d) => shiftDate(d, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="w-[220px]">
          <DateField value={date} onChange={setDate} />
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isToday && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDate(today)}
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
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading attendance...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No matching employees.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const isSaving =
                  editingEmpId === r.employeeId && override.isPending;
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
                    </TableCell>
                    <TableCell>{formatTime(r.checkInTime)}</TableCell>
                    <TableCell>{formatTime(r.checkOutTime)}</TableCell>
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
