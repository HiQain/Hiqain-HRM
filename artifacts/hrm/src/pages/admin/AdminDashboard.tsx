import { Link } from "wouter";
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Plane,
  Cake,
  PartyPopper,
  Gift,
  TrendingUp,
  Banknote,
  ArrowRight,
} from "lucide-react";
import { useGetAdminDashboard } from "@workspace/api-client-react";
import { PageHeader } from "@/components/PageHeader";
import { AttendanceRuleHint } from "@/components/AttendanceRuleHint";
import { StatCard } from "@/components/StatCard";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";

const SE_ICONS = {
  bonus: { icon: Gift, tone: "bg-emerald-50 text-emerald-700" },
  loan: { icon: Banknote, tone: "bg-amber-50 text-amber-700" },
  increment: { icon: TrendingUp, tone: "bg-sky-50 text-sky-700" },
} as const;

export function AdminDashboard() {
  const { data, isLoading } = useGetAdminDashboard();
  const recentSalaryEvents = data?.recentSalaryEvents ?? [];
  const upcomingBirthdays = data?.upcomingBirthdays ?? [];
  const upcomingAnniversaries = data?.upcomingAnniversaries ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="HR Dashboard"
        description="A snapshot of your team today."
      />
      <AttendanceRuleHint />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {isLoading || !data ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[112px] rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Total employees"
              value={data.totalEmployees}
              icon={Users}
              tone="primary"
            />
            <StatCard
              label="Present today"
              value={data.presentToday}
              icon={CheckCircle2}
              tone="success"
            />
            <StatCard
              label="Late today"
              value={data.lateToday}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              label="Absent today"
              value={data.absentToday}
              icon={XCircle}
              tone="danger"
            />
            <StatCard
              label="On leave today"
              value={data.onLeaveToday}
              icon={Plane}
              tone="info"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-border bg-gradient-to-br from-primary to-indigo-600 p-6 text-primary-foreground shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              Pending leave requests
            </p>
            <p className="mt-2 text-5xl font-bold tracking-tight">
              {data?.pendingLeaveRequests ?? 0}
            </p>
            <p className="mt-1 text-sm opacity-90">
              Awaiting your review and approval.
            </p>
            <Button
              asChild
              variant="secondary"
              className="mt-4 bg-white text-primary hover:bg-white/90"
            >
              <Link href="/admin/leaves">
                Review pending leaves
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-gradient-to-br from-sky-500 to-blue-700 p-6 text-white shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              Pending other requests
            </p>
            <p className="mt-2 text-5xl font-bold tracking-tight">
              {data?.pendingOtherRequests ?? 0}
            </p>
            <p className="mt-1 text-sm opacity-90">
              General requests awaiting your review.
            </p>
            <Button
              asChild
              variant="secondary"
              className="mt-4 bg-white text-blue-700 hover:bg-white/90"
            >
              <Link href="/admin/requests">
                Review pending requests
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <SectionCard title="Recent salary events" href="/admin/employees">
            {recentSalaryEvents.length > 0 ? (
              <ul className="divide-y divide-border">
                {recentSalaryEvents.map((e) => {
                  const cfg = SE_ICONS[e.type as keyof typeof SE_ICONS];
                  const Icon = cfg?.icon ?? Gift;
                  return (
                    <li key={e.id} className="flex items-center gap-3 py-3">
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${cfg?.tone ?? "bg-muted"}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium capitalize">
                          {e.type}
                          {e.reason ? ` · ${e.reason}` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(e.date)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">
                        {formatCurrency(e.amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState
                title="No salary events yet"
                description="Bonuses, loans and increments will appear here as you record them."
              />
            )}
          </SectionCard>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Upcoming birthdays">
          {upcomingBirthdays.length > 0 ? (
            <ul className="divide-y divide-border">
              {upcomingBirthdays.map((b) => (
                <li
                  key={b.employeeId + b.date}
                  className="flex items-center gap-3 py-3"
                >
                  <EmployeeAvatar name={b.employeeName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.date)}
                    </p>
                  </div>
                  <Cake className="h-4 w-4 text-rose-500" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No birthdays in the next 30 days"
              description="Add dates of birth to employee profiles to see upcoming celebrations."
            />
          )}
        </SectionCard>

        <SectionCard title="Upcoming work anniversaries">
          {upcomingAnniversaries.length > 0 ? (
            <ul className="divide-y divide-border">
              {upcomingAnniversaries.map((b) => (
                <li
                  key={b.employeeId + b.date}
                  className="flex items-center gap-3 py-3"
                >
                  <EmployeeAvatar name={b.employeeName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{b.employeeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.date)}
                    </p>
                  </div>
                  <PartyPopper className="h-4 w-4 text-violet-500" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No anniversaries in the next 30 days"
              description="Anniversaries appear here a month before the date."
            />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        {href && (
          <Link
            href={href}
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
