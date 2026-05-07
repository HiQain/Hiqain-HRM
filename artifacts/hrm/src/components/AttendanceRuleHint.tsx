import { formatHM12 } from "@/lib/utils";

export function AttendanceRuleHint({
  officeStartTime,
  gracePeriodMinutes,
  className = "",
}: {
  officeStartTime?: string | null;
  gracePeriodMinutes?: number | null;
  className?: string;
}) {
  if (!officeStartTime || gracePeriodMinutes == null) {
    return (
      <p className={`text-xs text-muted-foreground ${className}`.trim()}>
        Late status applies after each employee&apos;s office start time plus their
        grace period.
      </p>
    );
  }

  const [hour, minute] = officeStartTime.split(":").map(Number);
  const totalMinutes =
    (Number.isFinite(hour) ? hour : 0) * 60 +
    (Number.isFinite(minute) ? minute : 0) +
    gracePeriodMinutes;
  const cutoffHour = Math.floor((totalMinutes % (24 * 60)) / 60);
  const cutoffMinute = totalMinutes % 60;
  const cutoff = `${String(cutoffHour).padStart(2, "0")}:${String(cutoffMinute).padStart(2, "0")}`;

  return (
    <p className={`text-xs text-muted-foreground ${className}`.trim()}>
      Late after {formatHM12(cutoff)}. Full shift hours on checkout convert late to
      present; under 25% worked time counts as absent.
    </p>
  );
}
