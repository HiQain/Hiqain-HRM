import { formatTime } from "@/lib/utils";

const MISSING_CHECKOUT_TAG = "[attendance_missing_checkout]";
const AUTO_CHECKOUT_TAG = "[attendance_auto_checkout]";

export function isMissingCheckout(notes?: string | null) {
  const value = notes ?? "";
  return value.includes(MISSING_CHECKOUT_TAG) || value.includes(AUTO_CHECKOUT_TAG);
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
  if (checkOutTime) return formatTime(checkOutTime);
  if (checkInTime && isMissingCheckout(notes)) return "Missing";
  return fallback;
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
