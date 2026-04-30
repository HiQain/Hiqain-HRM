import { useMemo, useState } from "react";
import {
  useGetSettings,
  getGetSettingsQueryKey,
  useGetMe,
  useGetEmployee,
  getGetEmployeeQueryKey,
} from "@workspace/api-client-react";
import {
  Building2,
  CalendarDays,
  Clock,
  FileText,
  Wallet,
  Coffee,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextView } from "@/components/RichTextEditor";
import { FilePreview } from "@/components/FilePreview";
import { formatHMRange12, formatDate } from "@/lib/utils";

const WEEK_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Country = "us" | "pk" | "other";

function parseTime(t: string): number {
  const [h, m] = t.split(":").map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function computeWorkingDaysInMonth(
  year: number,
  monthIndex: number,
  offDays: number[],
  holidayDates: Set<string>,
): number {
  const offSet = new Set(offDays);
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, monthIndex, d);
    if (offSet.has(date.getDay())) continue;
    const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(
      d,
    ).padStart(2, "0")}`;
    if (holidayDates.has(iso)) continue;
    count++;
  }
  return count;
}

export function MySettingsPage() {
  const { data: me } = useGetMe();
  const empId = me?.employeeId ?? 0;
  const { data: employee } = useGetEmployee(empId, {
    query: { enabled: !!empId, queryKey: getGetEmployeeQueryKey(empId) },
  });
  const { data, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const [holidayFilter, setHolidayFilter] = useState<"us" | "pk">("us");

  // Use employee's own office hours if available, else fall back to defaults.
  const startTime =
    employee?.officeStartTime ?? data?.defaultOfficeStartTime ?? "09:00";
  const endTime =
    employee?.officeEndTime ?? data?.defaultOfficeEndTime ?? "18:00";

  const personalHours = useMemo(() => {
    if (!data) return { daily: 0, weekly: 0, monthly: 0 };
    const diffMin = Math.max(0, parseTime(endTime) - parseTime(startTime));
    const daily = Math.round((diffMin / 60) * 100) / 100;
    const offDays = data.weeklyOffDays ?? [0, 6];
    const workingDaysPerWeek = 7 - offDays.length;
    const weekly = Math.round(daily * workingDaysPerWeek);
    const today = new Date();
    const holidaySet = new Set(
      (data.publicHolidays ?? []).map((h) => h.date as unknown as string),
    );
    const monthlyDays = computeWorkingDaysInMonth(
      today.getFullYear(),
      today.getMonth(),
      offDays,
      holidaySet,
    );
    const monthly = Math.round(daily * monthlyDays);
    return { daily, weekly, monthly };
  }, [data, startTime, endTime]);

  const holidays = useMemo(() => {
    if (!data) return [] as { date: string; name: string; country: "us" | "pk" }[];
    return data.publicHolidays.map((h) => {
      const raw = (h.country as Country) ?? "other";
      let country: "us" | "pk";
      if (raw === "us" || raw === "pk") {
        country = raw;
      } else {
        country = /eid|muharram|ashura|ramadan|iqbal|jinnah|pakistan|kashmir/i.test(
          h.name,
        )
          ? "pk"
          : "us";
      }
      return {
        date: h.date as unknown as string,
        name: h.name,
        country,
      };
    });
  }, [data]);

  const counts = useMemo(
    () => ({
      us: holidays.filter((h) => h.country === "us").length,
      pk: holidays.filter((h) => h.country === "pk").length,
    }),
    [holidays],
  );

  const filteredHolidays = useMemo(
    () => holidays.filter((h) => h.country === holidayFilter),
    [holidays, holidayFilter],
  );

  const upcomingHolidays = useMemo(
    () =>
      [...filteredHolidays]
        .filter(
          (h) => new Date(h.date) >= new Date(new Date().toDateString()),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [filteredHolidays],
  );

  const allHolidays = useMemo(
    () => [...filteredHolidays].sort((a, b) => a.date.localeCompare(b.date)),
    [filteredHolidays],
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const offDayLabels = (data.weeklyOffDays ?? [])
    .map((d) => WEEK_DAY_LABELS[d])
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Settings"
        description="Policies and company-wide rules set by your HR team."
      />

      <Section title="Company" icon={Building2}>
        <Stat label="Company name" value={data.companyName} />
      </Section>

      <Section title="My office hours" icon={Clock}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Office hours"
            value={formatHMRange12(startTime, endTime)}
          />
          <Stat label="Per day" value={`${personalHours.daily} h`} />
          <Stat label="Per week" value={`${personalHours.weekly} h`} />
          <Stat label="This month" value={`${personalHours.monthly} h`} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Weekly off days" value={offDayLabels || "—"} />
          <Stat
            label="Grace period"
            value={`${data.defaultGracePeriodMinutes} min`}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          These are the official hours assigned to you. Per-week and per-month totals exclude weekly off days and public holidays.
        </p>
      </Section>

      <Section title="Leave quotas (per year)" icon={Coffee}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Casual leave"
            value={`${
              employee?.casualLeaveQuota ?? data.defaultCasualLeaveQuota
            } days`}
          />
          <Stat
            label="Sick leave"
            value={`${
              employee?.sickLeaveQuota ?? data.defaultSickLeaveQuota
            } days`}
          />
          <Stat
            label="Annual leave"
            value={`${
              employee?.annualLeaveQuota ?? data.defaultAnnualLeaveQuota
            } days`}
          />
        </div>
      </Section>

      <Section title="Salary structure" icon={Wallet}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Basic salary" value={`${data.basicSalaryPercent}%`} />
          <Stat label="Allowances" value={`${data.allowancePercent}%`} />
          <Stat
            label="Provident Fund"
            value={
              data.providentFundEnabled && data.defaultProvidentFundPercent > 0
                ? `${data.defaultProvidentFundPercent}% of basic`
                : "Not enabled"
            }
          />
        </div>
      </Section>

      <Section title="Attendance policy" icon={ShieldCheck}>
        <PolicyView
          html={data.attendancePolicy}
          fileUrl={data.attendancePolicyFileUrl}
          fileName={data.attendancePolicyFileName}
          emptyMessage="No attendance policy notes yet."
        />
      </Section>

      <Section title="Company policy" icon={ScrollText}>
        <PolicyView
          html={data.companyPolicy}
          fileUrl={data.companyPolicyFileUrl}
          fileName={data.companyPolicyFileName}
          emptyMessage="No company policy added yet."
        />
      </Section>

      <Section title="Public holidays" icon={CalendarDays}>
        <div className="space-y-3">
          <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
            <FilterTab
              active={holidayFilter === "us"}
              onClick={() => setHolidayFilter("us")}
              label={`US (${counts.us})`}
            />
            <FilterTab
              active={holidayFilter === "pk"}
              onClick={() => setHolidayFilter("pk")}
              label={`Pakistan (${counts.pk})`}
            />
          </div>

          {allHolidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No holidays in this view.
            </p>
          ) : (
            <div className="space-y-4">
              {upcomingHolidays.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Upcoming
                  </p>
                  <HolidayList items={upcomingHolidays} />
                </div>
              )}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  All holidays
                </p>
                <HolidayList items={allHolidays} />
              </div>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

function HolidayList({
  items,
}: {
  items: { date: string; name: string; country: Country }[];
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((h) => (
        <li
          key={`${h.date}-${h.name}`}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
        >
          <div className="flex items-center gap-3">
            <CountryBadge country={h.country} />
            <span className="font-medium">{h.name}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(h.date)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CountryBadge({ country }: { country: Country }) {
  const cls =
    country === "us"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
      : country === "pk"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        : "bg-muted text-muted-foreground";
  const label =
    country === "us" ? "US" : country === "pk" ? "PK" : "Other";
  return (
    <span
      className={`inline-flex h-5 min-w-[2rem] items-center justify-center rounded-full px-2 text-[10px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function FilterTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs transition ${
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function PolicyView({
  html,
  fileUrl,
  fileName,
  emptyMessage,
}: {
  html: string;
  fileUrl: string;
  fileName: string;
  emptyMessage: string;
}) {
  if (fileUrl) {
    return (
      <FilePreview
        url={fileUrl}
        name={fileName}
        label="Policy document"
      />
    );
  }
  // Strip HTML tags for emptiness check
  const plain = html?.replace(/<[^>]*>/g, "").trim();
  if (plain) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <RichTextView html={html} />
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
