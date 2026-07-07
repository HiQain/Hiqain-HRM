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
  Coffee,
  Download,
  FileText,
  Wallet,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RichTextView } from "@/components/RichTextEditor";
import { FilePreview } from "@/components/FilePreview";
import { formatHMRange12, formatDateCalendar } from "@/lib/utils";
import { buildScheduledHoursTargets } from "@/lib/attendanceHours";
import {
  useAttendanceExtensionStatus,
  useDisconnectAttendanceExtension,
} from "@/lib/attendanceExtension";
import {
  filterHolidays,
  filterHolidaysByYear,
  getCurrentHolidayYear,
  getHighlightedHoliday,
  getMonthLabel,
  normalizeHolidayCountry,
  sortHolidays,
  type HolidayFilter,
} from "@/lib/holidays";

const WEEK_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Country = "us" | "pk" | "other";

export function MySettingsPage() {
  const { data: me } = useGetMe();
  const empId = me?.employeeId ?? 0;
  const { data: employee } = useGetEmployee(empId, {
    query: { enabled: !!empId, queryKey: getGetEmployeeQueryKey(empId) },
  });
  const { data, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const { data: extensionStatus } = useAttendanceExtensionStatus();
  const disconnectExtension = useDisconnectAttendanceExtension();
  const [holidayFilter, setHolidayFilter] = useState<HolidayFilter>("all");
  const currentHolidayYear = getCurrentHolidayYear();
  const extensionDownloadUrl = `${import.meta.env.BASE_URL}hrm-browser-extension.zip`;

  // Use employee's own office hours if available, else fall back to defaults.
  const startTime =
    employee?.officeStartTime ?? data?.defaultOfficeStartTime ?? "09:00";
  const endTime =
    employee?.officeEndTime ?? data?.defaultOfficeEndTime ?? "18:00";
  const breakMinutes = employee?.breakMinutes ?? 0;

  const personalHours = useMemo(() => {
    if (!data) return { daily: 0, weekly: 0, monthly: 0 };
    const offDays = data.weeklyOffDays ?? [0, 6];
    const holidaySet = new Set(
      (data.publicHolidays ?? []).map((h) => h.date as unknown as string),
    );
    return buildScheduledHoursTargets({
      officeStartTime: startTime,
      officeEndTime: endTime,
      breakMinutes,
      offDays,
      holidayDates: holidaySet,
      weekAnchorDate: new Date(),
    });
  }, [breakMinutes, data, startTime, endTime]);

  const holidays = useMemo(() => {
    if (!data) return [] as { date: string; name: string; country: Country }[];
    return sortHolidays(
      data.publicHolidays.map((h) => ({
        date: h.date as unknown as string,
        name: h.name,
        country: normalizeHolidayCountry(
          h.country as Country | undefined,
          h.name,
        ),
      })),
    );
  }, [data]);

  const counts = useMemo(
    () => ({
      all: filterHolidaysByYear(holidays, currentHolidayYear).length,
      us: filterHolidaysByYear(holidays, currentHolidayYear).filter(
        (h) => h.country === "us",
      ).length,
      pk: filterHolidaysByYear(holidays, currentHolidayYear).filter(
        (h) => h.country === "pk",
      ).length,
    }),
    [currentHolidayYear, holidays],
  );

  const filteredHolidays = useMemo(
    () =>
      filterHolidays(
        filterHolidaysByYear(holidays, currentHolidayYear),
        holidayFilter,
      ),
    [currentHolidayYear, holidays, holidayFilter],
  );

  const allHolidays = useMemo(
    () => sortHolidays(filteredHolidays),
    [filteredHolidays],
  );
  const highlightedHoliday = useMemo(
    () => getHighlightedHoliday(allHolidays),
    [allHolidays],
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
        title="Settings"
        description="Policies and company-wide rules set by your HR team."
      />

      <Section title="Company" icon={Building2}>
        <Stat label="Company name" value={data.companyName} />
      </Section>

      <Section title="My office hours" icon={Clock}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label="Office hours"
            value={formatHMRange12(startTime, endTime)}
          />
          <Stat label="Break time" value={`${breakMinutes} min`} />
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

      <Section title="Browser Extension" icon={FileText}>
        <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">
                Browser-connected attendance automation
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {`Install the browser extension, then connect it from the extension popup using your normal HRM email and password. Once connected, HRM can auto pause after ${
                  extensionStatus?.thresholds.pauseMinutes ?? 15
                } minutes idle.`}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Connection status"
                value={
                  extensionStatus?.link?.connected
                    ? "Connected"
                    : extensionStatus?.link?.status === "pending"
                      ? "Pending"
                      : "Not connected"
                }
              />
              <Stat
                label="Device"
                value={extensionStatus?.link?.deviceName || "—"}
              />
              <Stat
                label="Last heartbeat"
                value={formatOptionalDateTime(extensionStatus?.link?.lastHeartbeatAt)}
              />
              <Stat
                label="Last state"
                value={formatExtensionState(extensionStatus?.link?.lastState)}
              />
            </div>

            {extensionStatus?.link?.connected ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label="Browser alive"
                  value={
                    extensionStatus.link.browserAlive == null
                      ? "—"
                      : extensionStatus.link.browserAlive
                        ? "Yes"
                        : "No"
                  }
                />
                <Stat
                  label="Network online"
                  value={
                    extensionStatus.link.networkOnline == null
                      ? "—"
                      : extensionStatus.link.networkOnline
                        ? "Yes"
                        : "No"
                  }
                />
                <Stat
                  label="Extension"
                  value={extensionStatus.link.extensionVersion || "—"}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a
                  href={extensionDownloadUrl}
                  download="hrm-browser-extension.zip"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download extension
                </a>
              </Button>
              <Button
                variant="outline"
                onClick={() => disconnectExtension.mutate()}
                disabled={
                  disconnectExtension.isPending ||
                  !extensionStatus?.link?.connected
                }
              >
                {disconnectExtension.isPending
                  ? "Disconnecting..."
                  : "Disconnect extension"}
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">How to connect</p>
              <p className="mt-2">
                1. Download the extension zip, extract it, then load the extracted
                folder in Chrome or Edge developer mode.
              </p>
              <p className="mt-1">
                2. Open the extension popup and paste your HRM app URL. If you copy
                a page like `/employee` or `/admin`, the extension will still use
                the correct base URL automatically.
              </p>
              <p className="mt-1">
                3. Sign in with the same HRM email and password you already use,
                then check in as normal before starting work.
              </p>
              <p className="mt-1">
                4. Keep the browser running while you work. If the browser is
                closed entirely, HRM will fall back to stale-heartbeat auto
                checkout.
              </p>
            </div>
        </div>
      </Section>

      <Section title="Company policy" icon={ScrollText}>
        <PolicyView
          html={data.companyPolicy}
          fileUrl={data.companyPolicyFileUrl}
          fileName={data.companyPolicyFileName}
          emptyMessage="No company policy added yet."
        />
      </Section>

      <Section title={`Public holidays (${currentHolidayYear})`} icon={CalendarDays}>
        <div className="space-y-3">
          <div className="inline-flex rounded-md border border-border bg-muted p-0.5 text-xs">
            <FilterTab
              active={holidayFilter === "all"}
              onClick={() => setHolidayFilter("all")}
              label={`All (${counts.all})`}
            />
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
            <HolidayList items={allHolidays} highlighted={highlightedHoliday} />
          )}
        </div>
      </Section>
    </div>
  );
}

function formatOptionalDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: "Asia/Karachi",
      });
}

function formatExtensionState(value?: string | null) {
  if (!value) return "—";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function HolidayList({
  items,
  highlighted,
}: {
  items: { date: string; name: string; country: Country }[];
  highlighted?: { date: string; name: string; country: Country };
}) {
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const key = getMonthLabel(item.date);
    acc[key] = acc[key] ? [...acc[key]!, item] : [item];
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {highlighted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Highlighted
          </p>
          <div className="mt-2 flex items-start gap-3 text-sm">
            <div className="flex items-center gap-3">
              <CountryBadge country={highlighted.country} />
              <span className="font-medium">
                {formatDateCalendar(highlighted.date)} - {highlighted.name}
              </span>
            </div>
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([month, monthItems]) => (
        <div key={month} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border bg-muted/20 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {month}
          </div>
          <ul className="divide-y divide-border">
            {monthItems.map((h) => (
              <li
                key={`${h.date}-${h.name}`}
                className={`flex items-start justify-between gap-3 px-4 py-3 text-sm ${
                  highlighted?.date === h.date && highlighted?.name === h.name
                    ? "bg-emerald-50/60"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <CountryBadge country={h.country} />
                  <span className="font-medium">
                    {formatDateCalendar(h.date)} - {h.name}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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
