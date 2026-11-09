import { formatDuration, formatTime } from "@/lib/utils";

const MISSING_CHECKOUT_TAG = "[attendance_missing_checkout]";
const AUTO_CHECKOUT_TAG = "[attendance_auto_checkout]";

export function isMissingCheckout(notes?: string | null) {
  const value = notes ?? "";
  return value.includes(MISSING_CHECKOUT_TAG) || value.includes(AUTO_CHECKOUT_TAG);
}

export function formatWorkedDisplay({
  checkInTime,
  checkOutTime,
  workedMinutes,
  notes,
  fallback = "-",
}: {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  workedMinutes?: number | null;
  notes?: string | null;
  fallback?: string;
}) {
  if (checkInTime && isMissingCheckout(notes)) return "Missing";
  if (workedMinutes && workedMinutes > 0) return formatDuration(workedMinutes);
  return fallback;
}

export function formatCheckoutDisplay({
  checkInTime,
  checkOutTime,
  notes,
  fallback = "-",
}: {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  notes?: string | null;
  fallback?: string;
}) {
  if (checkInTime && isMissingCheckout(notes)) return "Missing";
  if (checkOutTime) return formatTime(checkOutTime);
  return fallback;
}

const ATTENDANCE_STATUS_TRIGGER_STYLES: Record<string, string> = {
  present: "border-emerald-300 bg-emerald-50 text-emerald-700 [&>svg]:text-emerald-500",
  late: "border-amber-300 bg-amber-50 text-amber-700 [&>svg]:text-amber-500",
  absent: "border-rose-300 bg-rose-50 text-rose-700 [&>svg]:text-rose-500",
  on_leave: "border-sky-300 bg-sky-50 text-sky-700 [&>svg]:text-sky-500",
  half_day: "border-purple-300 bg-purple-50 text-purple-700 [&>svg]:text-purple-500",
  remote_work: "border-teal-300 bg-teal-50 text-teal-700 [&>svg]:text-teal-500",
};

export function attendanceStatusTriggerClass(status?: string | null) {
  return ATTENDANCE_STATUS_TRIGGER_STYLES[status ?? ""] ?? "";
}

export function formatAttendanceReason(notes?: string | null) {
  const cleaned = (notes ?? "")
    .replace(/\[manual_attendance_override\]/g, "")
    .replace(/\[attendance_work_mode:(?:onsite|remote_work)\]/g, "")
    .replace(new RegExp(MISSING_CHECKOUT_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "")
    .replace(new RegExp(AUTO_CHECKOUT_TAG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return cleaned || "-";
}
