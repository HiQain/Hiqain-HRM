import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n: number | string | null | undefined): string {
  const num = typeof n === "number" ? n : Number(n ?? 0);
  if (!Number.isFinite(num)) return "PKR 0";
  return `PKR ${Math.round(num).toLocaleString("en-US")}`;
}

export function formatNumberInput(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const normalized =
    typeof value === "number"
      ? String(value)
      : String(value).replace(/,/g, "").trim();
  if (!normalized) return "";
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return "";
  return parsed.toLocaleString("en-US");
}

export function parseNumberInput(value: string): number {
  const normalized = value.replace(/,/g, "").replace(/[^\d.-]/g, "").trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePakistanPhoneInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "+92";
  if (trimmed.startsWith("+") && !trimmed.startsWith("+92")) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "+92";
  if (digits.startsWith("92")) return `+${digits}`;
  if (digits.startsWith("0")) return `+92${digits.slice(1)}`;
  return `+92${digits}`;
}

export function hasPhoneSubscriberNumber(
  value: string | null | undefined,
): boolean {
  const normalized = normalizePakistanPhoneInput(value ?? "");
  const digits = normalized.replace(/\D/g, "");
  return digits.length > 2;
}

export function normalizeCnicInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

// Canonical app date format: "Mon, May 13, 26"
function _formatAppDate(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s.length === 10 ? s + "T00:00:00Z" : s) : s;
  if (Number.isNaN(d.getTime())) return "—";
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${weekday}, ${month} ${day}, ${year}`;
}

export function formatDate(s: string | Date | null | undefined): string {
  return _formatAppDate(s);
}

// Kept for compatibility — same canonical format as formatDate.
export function formatDateShort(s: string | Date | null | undefined): string {
  return _formatAppDate(s);
}

export function daysBetweenInclusive(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  if (!start || !end) return 0;
  const s = new Date(start.length === 10 ? start + "T00:00:00Z" : start);
  const e = new Date(end.length === 10 ? end + "T00:00:00Z" : end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  if (e < s) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.round(ms / 86400000) + 1;
}

export function formatDateLong(s: string | Date | null | undefined): string {
  return _formatAppDate(s);
}

export function formatDateCalendar(s: string | Date | null | undefined): string {
  if (!s) return "—";
  const d =
    typeof s === "string"
      ? new Date(s.length === 10 ? `${s}T00:00:00Z` : s)
      : s;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });
}

// Convert "HH:MM" 24-hour string to "h:MM AM/PM" 12-hour string.
export function formatHM12(hm: string | null | undefined): string {
  if (!hm) return "—";
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return hm;
  const hour = Number(m[1]);
  const minute = m[2]!;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return hm;
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${ampm}`;
}

export function formatHMRange12(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  return `${formatHM12(start)} – ${formatHM12(end)}`;
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function formatMonth(month: number, year: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function initialsFrom(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

export function avatarColor(name: string | null | undefined): string {
  if (!name) return AVATAR_PALETTE[0]!;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function truncateFilename(name: string, maxLen = 20): string {
  if (name.length <= maxLen) return name;
  const ext = name.lastIndexOf(".");
  if (ext > 0 && name.length - ext <= 5) {
    return name.slice(0, maxLen - (name.length - ext) - 1) + "…" + name.slice(ext);
  }
  return name.slice(0, maxLen) + "…";
}
