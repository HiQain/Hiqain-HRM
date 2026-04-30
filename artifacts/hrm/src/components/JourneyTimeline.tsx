import { useState } from "react";
import {
  Briefcase,
  ShieldCheck,
  BadgeCheck,
  Cake,
  PartyPopper,
  Gift,
  Banknote,
  TrendingUp,
  Search,
  LogOut,
  ArrowUpRight,
  Coins,
} from "lucide-react";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type EventType =
  | "joining"
  | "probation_start"
  | "probation_end"
  | "anniversary"
  | "birthday"
  | "bonus"
  | "loan"
  | "increment"
  | "commission"
  | "designation_change"
  | "left";

const ICONS = {
  joining: { icon: Briefcase, tone: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  probation_start: { icon: ShieldCheck, tone: "bg-amber-50 text-amber-700 ring-amber-200" },
  probation_end: { icon: BadgeCheck, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  anniversary: { icon: PartyPopper, tone: "bg-violet-50 text-violet-700 ring-violet-200" },
  birthday: { icon: Cake, tone: "bg-rose-50 text-rose-700 ring-rose-200" },
  bonus: { icon: Gift, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  loan: { icon: Banknote, tone: "bg-amber-50 text-amber-700 ring-amber-200" },
  increment: { icon: TrendingUp, tone: "bg-sky-50 text-sky-700 ring-sky-200" },
  commission: { icon: Coins, tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  designation_change: { icon: ArrowUpRight, tone: "bg-blue-50 text-blue-700 ring-blue-200" },
  left: { icon: LogOut, tone: "bg-rose-50 text-rose-700 ring-rose-200" },
} as const;

export type JourneyEventLike = {
  date: string;
  type: EventType | string;
  title: string;
  description?: string | null;
  amount?: number | null;
};

export function JourneyTimeline({
  events,
}: {
  events: JourneyEventLike[];
}) {
  const [search, setSearch] = useState("");

  const sorted = [...events].sort((a, b) => (a.date < b.date ? 1 : -1));

  const filtered = search.trim()
    ? sorted.filter(
        (e) =>
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          (e.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
          e.date.includes(search),
      )
    : sorted;

  if (!events.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">No journey events yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Once joining, anniversaries and salary events accumulate, they'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search journey events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No events match your search.
        </div>
      ) : (
        <ol className="relative border-l border-border pl-6">
          {filtered.map((e, i) => {
            const cfg = ICONS[(e.type as EventType)] ?? ICONS.joining;
            const Icon = cfg.icon;
            return (
              <li key={i} className="mb-7 last:mb-0">
                <span
                  className={cn(
                    "absolute -left-[18px] flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-background",
                    cfg.tone,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{e.title}</p>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(e.date)}
                    </p>
                  </div>
                  {e.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {e.description}
                    </p>
                  )}
                  {e.amount != null && (
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {formatCurrency(e.amount)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
