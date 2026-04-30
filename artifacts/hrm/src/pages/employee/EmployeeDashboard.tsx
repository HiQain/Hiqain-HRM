import { Link } from "wouter";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Plane,
  LogIn,
  LogOut,
  ArrowRight,
} from "lucide-react";
import {
  useGetEmployeeDashboard,
  useCheckIn,
  useCheckOut,
  getGetEmployeeDashboardQueryKey,
  getGetTodayAttendanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  formatDate,
  formatDateLong,
  formatDuration,
  formatHMRange12,
  formatTime,
} from "@/lib/utils";

export function EmployeeDashboard() {
  const { data, isLoading } = useGetEmployeeDashboard();
  const qc = useQueryClient();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetEmployeeDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTodayAttendanceQueryKey() });
  };

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-44 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { employee, todayAttendance, monthAttendance, leaveBalance, recentLeaves } = data;

  const onCheckIn = () =>
    checkIn.mutate(undefined, {
      onSuccess: () => {
        toast.success("You're checked in");
        refresh();
      },
      onError: (e: any) =>
        toast.error(e?.message ?? "Could not check in"),
    });
  const onCheckOut = () =>
    checkOut.mutate(undefined, {
      onSuccess: () => {
        toast.success("Have a great evening");
        refresh();
      },
      onError: (e: any) =>
        toast.error(e?.message ?? "Could not check out"),
    });

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Hi, ${employee.name.split(" ")[0]}`}
        description={formatDateLong(new Date())}
      />

      {/* Hero check-in */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-primary to-indigo-600 p-6 text-primary-foreground shadow-md sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              Today's attendance
            </p>
            <div className="mt-1 flex items-baseline gap-3">
              <h2 className="text-3xl font-semibold tracking-tight">
                {todayAttendance.hasCheckedOut
                  ? "Day complete"
                  : todayAttendance.hasCheckedIn
                    ? "You're checked in"
                    : "Ready to start your day?"}
              </h2>
              {todayAttendance.record?.status && (
                <StatusBadge status={todayAttendance.record.status} className="bg-white/15 ring-white/20 text-white" />
              )}
            </div>
            <p className="mt-1 text-sm opacity-90">
              Office hours {formatHMRange12(employee.officeStartTime, employee.officeEndTime)}, with a {employee.gracePeriodMinutes}-min grace.
            </p>
            {todayAttendance.record && (
              <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="opacity-70">Check-in</p>
                  <p className="mt-0.5 font-semibold">
                    {formatTime(todayAttendance.record.checkInTime)}
                  </p>
                </div>
                <div>
                  <p className="opacity-70">Check-out</p>
                  <p className="mt-0.5 font-semibold">
                    {formatTime(todayAttendance.record.checkOutTime)}
                  </p>
                </div>
                <div>
                  <p className="opacity-70">Worked</p>
                  <p className="mt-0.5 font-semibold">
                    {formatDuration(todayAttendance.record.workedMinutes)}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-white/90"
              disabled={
                todayAttendance.hasCheckedIn || checkIn.isPending
              }
              onClick={onCheckIn}
            >
              <LogIn className="mr-2 h-5 w-5" />
              {checkIn.isPending ? "Checking in..." : "Check in"}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              disabled={
                !todayAttendance.hasCheckedIn ||
                todayAttendance.hasCheckedOut ||
                checkOut.isPending
              }
              onClick={onCheckOut}
            >
              <LogOut className="mr-2 h-5 w-5" />
              {checkOut.isPending ? "Checking out..." : "Check out"}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Present" value={monthAttendance.present} icon={CheckCircle2} tone="success" />
        <StatCard label="Late" value={monthAttendance.late} icon={Clock} tone="warning" sub={`Of ${monthAttendance.present}`} />
        <StatCard label="Absent" value={monthAttendance.absent} icon={XCircle} tone="danger" />
        <StatCard label="On leave" value={monthAttendance.onLeave} icon={Plane} tone="info" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Leave balance</p>
            <Link href="/employee/leaves" className="text-xs font-medium text-primary hover:underline">
              Apply for leave
            </Link>
          </div>
          <div className="mt-4 space-y-4">
            <Balance label="Sick" used={leaveBalance.sickUsed} total={leaveBalance.sick} />
            <Balance label="Casual" used={leaveBalance.casualUsed} total={leaveBalance.casual} />
            <Balance label="Annual" used={leaveBalance.annualUsed} total={leaveBalance.annual} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Recent leaves</p>
            <Link href="/employee/leaves" className="text-xs font-medium text-primary hover:underline">
              View all <ArrowRight className="ml-1 inline h-3 w-3" />
            </Link>
          </div>
          {recentLeaves.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No leaves applied yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentLeaves.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {l.type} leave · {l.days} day{l.days > 1 ? "s" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(l.startDate)} – {formatDate(l.endDate)}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

    </div>
  );
}

function Balance({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number;
}) {
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const remaining = Math.max(0, total - used);
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground">{remaining}</span>{" "}
          left of {total}
        </span>
      </div>
      <Progress value={pct} className="mt-1.5 h-1.5" />
    </div>
  );
}
