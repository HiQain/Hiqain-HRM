import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  XCircle,
  Plane,
  Play,
  Pause,
  LogIn,
  LogOut,
  ArrowRight,
} from "lucide-react";
import {
  useGetEmployeeDashboard,
  useCheckIn,
  usePauseAttendance,
  useResumeAttendance,
  useCheckOut,
  getGetEmployeeDashboardQueryKey,
  getGetTodayAttendanceQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { AttendanceRuleHint } from "@/components/AttendanceRuleHint";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  attendanceExtensionStatusQueryKey,
  useAttendanceExtensionStatus,
} from "@/lib/attendanceExtension";
import { computeScheduledShiftMinutes } from "@/lib/attendanceHours";
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
  const pauseAttendance = usePauseAttendance();
  const resumeAttendance = useResumeAttendance();
  const checkOut = useCheckOut();
  const { data: extensionStatus } = useAttendanceExtensionStatus();
  const [now, setNow] = useState(() => Date.now());
  const [warningOpen, setWarningOpen] = useState(false);
  const [dismissedWarningAt, setDismissedWarningAt] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getGetEmployeeDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetTodayAttendanceQueryKey() });
    qc.invalidateQueries({ queryKey: attendanceExtensionStatusQueryKey });
  };

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const warningAt = extensionStatus?.link?.lastWarningAt ?? null;
    if (
      extensionStatus?.link?.warningActive &&
      warningAt &&
      dismissedWarningAt !== warningAt
    ) {
      setWarningOpen(true);
    }
  }, [
    dismissedWarningAt,
    extensionStatus?.link?.lastWarningAt,
    extensionStatus?.link?.warningActive,
  ]);

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
  const activeRecord = todayAttendance.record;
  const requiredShiftMinutes = computeScheduledShiftMinutes(
    employee.officeStartTime,
    employee.officeEndTime,
    employee.breakMinutes,
  );
  const activePauseMinutes =
    activeRecord?.pausedAt && !activeRecord?.checkOutTime
      ? Math.max(
          0,
          Math.floor((now - new Date(activeRecord.pausedAt).getTime()) / 60000),
        )
      : 0;
  const totalPausedMinutes = (activeRecord?.pausedMinutes ?? 0) + activePauseMinutes;
  const liveWorkedMinutes =
    activeRecord?.checkInTime && !activeRecord?.checkOutTime
      ? Math.max(
          0,
          Math.floor(
            (now - new Date(activeRecord.checkInTime).getTime()) / 60000,
          ) -
            totalPausedMinutes,
        )
      : activeRecord?.workedMinutes ?? 0;
  const remainingShiftMinutes = Math.max(
    0,
    requiredShiftMinutes - liveWorkedMinutes,
  );
  const workedProgress = requiredShiftMinutes
    ? Math.min(100, Math.round((liveWorkedMinutes / requiredShiftMinutes) * 100))
    : 0;
  const liveStatus = (() => {
    if (!activeRecord?.status) return null;
    if (activeRecord.checkOutTime) return activeRecord.status;
    if (!activeRecord.checkInTime) return activeRecord.status;

    const [year, month, day] = activeRecord.date.split("-").map(Number);
    const [h, m] = employee.officeStartTime.split(":").map(Number);
    const officeStartUtc =
      Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, h ?? 0, m ?? 0) -
      5 * 60 * 60 * 1000;
    const graceCutoffUtc = officeStartUtc + employee.gracePeriodMinutes * 60 * 1000;
    const checkedInLate =
      new Date(activeRecord.checkInTime).getTime() > graceCutoffUtc;

    return checkedInLate ? "late" : activeRecord.status;
  })();

  const onCheckIn = () =>
    checkIn.mutate(undefined, {
      onSuccess: () => {
        toast.success("You're checked in");
        refresh();
      },
      onError: (e: any) =>
        toast.error(e?.message ?? "Could not check in"),
    });
  const onPause = () =>
    pauseAttendance.mutate(undefined, {
      onSuccess: () => {
        toast.success("Attendance paused");
        refresh();
      },
      onError: (e: any) =>
        toast.error(e?.message ?? "Could not pause attendance"),
    });
  const onResume = () =>
    resumeAttendance.mutate(undefined, {
      onSuccess: () => {
        toast.success("Attendance resumed");
        refresh();
      },
      onError: (e: any) =>
        toast.error(e?.message ?? "Could not resume attendance"),
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

  const extensionLink = extensionStatus?.link ?? null;
  const showExtensionSetupCard =
    !!activeRecord?.checkInTime &&
    !activeRecord?.checkOutTime &&
    !extensionLink?.connected;

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
              {liveStatus && (
                <StatusBadge status={liveStatus} className="bg-white/15 ring-white/20 text-white" />
              )}
            </div>
            <p className="mt-1 text-sm opacity-90">
              Office hours {formatHMRange12(employee.officeStartTime, employee.officeEndTime)}, with a {employee.gracePeriodMinutes}-min grace.
            </p>
            <p className="mt-1 text-sm opacity-90">
              Required working time for this shift: {formatDuration(requiredShiftMinutes)}.
              Pausing attendance stops the timer until you resume.
            </p>
            <AttendanceRuleHint
              officeStartTime={employee.officeStartTime}
              gracePeriodMinutes={employee.gracePeriodMinutes}
              className="mt-2 text-white/85"
            />
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
                    {formatDuration(liveWorkedMinutes)}
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
            {todayAttendance.hasCheckedIn && !todayAttendance.hasCheckedOut && (
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                disabled={pauseAttendance.isPending || resumeAttendance.isPending}
                onClick={todayAttendance.isPaused ? onResume : onPause}
              >
                {todayAttendance.isPaused ? (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    {resumeAttendance.isPending ? "Resuming..." : "Resume"}
                  </>
                ) : (
                  <>
                    <Pause className="mr-2 h-5 w-5" />
                    {pauseAttendance.isPending ? "Pausing..." : "Pause"}
                  </>
                )}
              </Button>
            )}
            <Button
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              disabled={
                !todayAttendance.hasCheckedIn ||
                todayAttendance.hasCheckedOut ||
                pauseAttendance.isPending ||
                resumeAttendance.isPending ||
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

      {todayAttendance.hasCheckedIn ? (
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Today&apos;s working progress
              </p>
              <h3 className="mt-1 text-xl font-semibold text-foreground">
                {todayAttendance.isPaused
                  ? "Break timer is paused"
                  : todayAttendance.hasCheckedOut
                    ? "Shift progress recorded"
                    : "Timer is counting active working time"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Worked time only grows while attendance is active. Break minutes stay excluded, so employees still need to complete the full scheduled shift.
              </p>
            </div>
            <div className="min-w-52 rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-sm">
              <p className="text-muted-foreground">Shift target</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatDuration(requiredShiftMinutes)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatHMRange12(employee.officeStartTime, employee.officeEndTime)}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <StatCard
              label="Worked"
              value={formatDuration(liveWorkedMinutes)}
              icon={Clock}
              tone="success"
            />
            <StatCard
              label="Break"
              value={formatDuration(totalPausedMinutes)}
              icon={Pause}
              tone="warning"
            />
            <StatCard
              label="Remaining"
              value={formatDuration(remainingShiftMinutes)}
              icon={ArrowRight}
              tone="info"
            />
            <StatCard
              label="Required"
              value={formatDuration(requiredShiftMinutes)}
              icon={CheckCircle2}
              tone="default"
            />
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">Shift completion</span>
              <span className="text-muted-foreground">{workedProgress}%</span>
            </div>
            <Progress value={workedProgress} className="h-2.5" />
          </div>
        </div>
      ) : null}

      {showExtensionSetupCard ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
                Browser Extension
              </p>
              <h3 className="mt-1 text-xl font-semibold">
                Connect this browser to keep idle attendance automation on
              </h3>
              <p className="mt-1 text-sm text-amber-900/80">
                HRM can auto-pause after 10 minutes idle, warn after 20, and auto
                check out after 30 once this browser is linked.
              </p>
              <p className="mt-3 text-sm text-amber-900/70">
                Open the extension popup and sign in with the same HRM email and password you already use here.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link href="/employee/settings">
                <Button className="w-full sm:w-auto lg:w-full">
                  Open settings
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : null}

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

      <Dialog
        open={warningOpen}
        onOpenChange={(open) => {
          setWarningOpen(open);
          if (!open && extensionLink?.lastWarningAt) {
            setDismissedWarningAt(extensionLink.lastWarningAt);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Low activity detected</DialogTitle>
            <DialogDescription>
              HRM has not seen activity in this browser for {extensionLink?.idleForMinutes ?? 0} minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              If inactivity continues, HRM will auto check you out in about{" "}
              {extensionLink?.warningCountdownMinutes ?? 0} minute(s).
            </p>
            <p>
              Move the mouse, type, or focus back on your work browser. If needed,
              open the extension and press <span className="font-medium text-foreground">Sync</span>.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (extensionLink?.lastWarningAt) {
                  setDismissedWarningAt(extensionLink.lastWarningAt);
                }
                setWarningOpen(false);
              }}
            >
              Dismiss
            </Button>
            <Link href="/employee/settings">
              <Button onClick={() => setWarningOpen(false)}>Open extension help</Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
