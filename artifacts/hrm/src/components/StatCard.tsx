import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "primary";
}) {
  const tones = {
    default: "bg-muted/40 text-foreground",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    info: "bg-sky-50 text-sky-700",
    primary: "bg-primary/10 text-primary",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {Icon && (
          <span
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-lg",
              tones[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}
