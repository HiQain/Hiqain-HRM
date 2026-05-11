import { memo } from "react";
import { cn } from "@/lib/utils";

type Status =
  | "present"
  | "late"
  | "absent"
  | "on_leave"
  | "half_day"
  | "remote_work"
  | "weekend"
  | "holiday"
  | "future"
  | "none"
  | "pending"
  | "approved"
  | "rejected";

const LABELS: Record<Status, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  on_leave: "On Leave",
  half_day: "Half Day",
  remote_work: "Remote Work",
  weekend: "Weekend",
  holiday: "Holiday",
  future: "—",
  none: "—",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STYLES: Record<Status, string> = {
  present: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  late: "bg-amber-50 text-amber-700 ring-amber-200",
  absent: "bg-rose-50 text-rose-700 ring-rose-200",
  on_leave: "bg-sky-50 text-sky-700 ring-sky-200",
  half_day: "bg-purple-50 text-purple-700 ring-purple-200",
  remote_work: "bg-teal-50 text-teal-700 ring-teal-200",
  weekend: "bg-slate-50 text-slate-500 ring-slate-200",
  holiday: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  future: "bg-slate-50 text-slate-400 ring-slate-200",
  none: "bg-slate-50 text-slate-400 ring-slate-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

const DOTS: Record<Status, string> = {
  present: "bg-emerald-500",
  late: "bg-amber-500",
  absent: "bg-rose-500",
  on_leave: "bg-sky-500",
  half_day: "bg-purple-500",
  remote_work: "bg-teal-500",
  weekend: "bg-slate-400",
  holiday: "bg-indigo-500",
  future: "bg-slate-300",
  none: "bg-slate-300",
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
};

export const StatusBadge = memo(function StatusBadge({
  status,
  className,
}: {
  status: Status | string;
  className?: string;
}) {
  const s = (status as Status) ?? "pending";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STYLES[s] ?? STYLES.pending,
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          DOTS[s] ?? DOTS.pending,
        )}
      />
      {LABELS[s] ?? status}
    </span>
  );
});
