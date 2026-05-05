import { AlertCircle, Landmark, PiggyBank, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import type { ProvidentFundSummary } from "@/lib/providentFund";

export function ProvidentFundLedgerCard({
  title,
  description,
  summary,
  emptyText,
}: {
  title: string;
  description: string;
  summary: ProvidentFundSummary;
  emptyText: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <PfStat
          label="Current balance"
          value={formatCurrency(summary.currentBalance)}
          emphasis="primary"
        />
        <PfStat
          label="Total contributed"
          value={formatCurrency(summary.totalContributed)}
        />
        <PfStat
          label="Approved withdrawals"
          value={formatCurrency(summary.totalWithdrawn)}
          tone="down"
        />
        <PfStat
          label="Available to request"
          value={formatCurrency(summary.availableToRequest)}
          emphasis="secondary"
        />
      </div>

      <div className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-3">
        <MiniInfo
          label="Pending withdrawals"
          value={formatCurrency(summary.pendingWithdrawals)}
          tone={summary.pendingWithdrawals > 0 ? "down" : undefined}
        />
        <MiniInfo
          label="PF counting"
          value={summary.probationCompleted ? "Started" : "After probation"}
        />
        <MiniInfo
          label="Withdrawal rule"
          value={summary.oneYearCompleted ? "Eligible by tenure" : "1 year required"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-xs">
        <Badge variant={summary.canWithdraw ? "default" : "secondary"}>
          {summary.canWithdraw ? "Withdrawal eligible" : "Not eligible yet"}
        </Badge>
        <span className="text-muted-foreground">
          Eligible after {formatDate(summary.eligibleAfterDate)}
        </span>
        <span className="text-muted-foreground">
          PF starts after probation completion.
        </span>
      </div>

      {summary.ledger.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.ledger.map((entry) => (
              <TableRow key={entry.key}>
                <TableCell className="font-medium">
                  {entry.kind === "contribution"
                    ? formatMonth(
                        Number(entry.date.slice(5, 7)),
                        Number(entry.date.slice(0, 4)),
                      )
                    : formatDate(entry.date)}
                </TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="font-medium">{entry.label}</p>
                    {entry.detail ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.detail}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={entry.status === "approved" ? "default" : "secondary"}>
                    {entry.status}
                  </Badge>
                </TableCell>
                <TableCell
                  className={`text-right font-semibold ${
                    entry.kind === "withdrawal" && entry.status === "approved"
                      ? "text-rose-600"
                      : "text-foreground"
                  }`}
                >
                  {entry.kind === "withdrawal" ? "-" : "+"}
                  {formatCurrency(entry.amount)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(entry.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function PfStat({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: "down";
  emphasis?: "primary" | "secondary";
}) {
  const Icon =
    tone === "down"
      ? Landmark
      : emphasis === "primary"
        ? PiggyBank
        : Wallet;
  const toneClass = tone === "down" ? "text-rose-600" : "text-foreground";
  const shellClass =
    emphasis === "primary"
      ? "border-emerald-200 bg-emerald-50/70"
      : emphasis === "secondary"
        ? "border-sky-200 bg-sky-50/60"
        : "border-border bg-background/40";

  return (
    <div className={`rounded-xl border p-4 ${shellClass}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <p className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function MiniInfo({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "down";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          tone === "down" ? "text-rose-600" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
