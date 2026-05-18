import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  useListGeneralRequests,
  useCreateGeneralRequest,
  useUpdateGeneralRequest,
  useDeleteGeneralRequest,
  useGetMe,
  useGetEmployee,
  useGetMyLoanEligibility,
  useGetMyPayslips,
  useGetSettings,
  getGetEmployeeQueryKey,
  getGetSettingsQueryKey,
  getGetMyLoanEligibilityQueryKey,
  getGetMyPayslipsQueryKey,
  getListGeneralRequestsQueryKey,
  type GeneralRequest,
  type GeneralRequestType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { ReasonCell } from "@/components/ReasonCell";
import { DateField } from "@/components/DateField";
import { type Attachment } from "@/components/AttachmentField";
import { MultiAttachmentField } from "@/components/MultiAttachmentField";
import { Paperclip } from "lucide-react";
import { EmployeeMentionSelect } from "@/components/EmployeeMentionSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import { buildProvidentFundSummary } from "@/lib/providentFund";

type FilterType =
  | "all"
  | "half_day"
  | "loan"
  | "increment"
  | "remote_work"
  | "late"
  | "pf_withdrawal"
  | "resignation"
  | "other";

const TYPE_LABEL: Record<string, string> = {
  half_day: "Half Day",
  loan: "Loan",
  increment: "Increment",
  remote_work: "Remote Work",
  late: "Late",
  pf_withdrawal: "PF Withdrawal",
  resignation: "Resignation",
  other: "Other",
};

export function MyRequestsPage() {
  const { data: me } = useGetMe();
  const [tab, setTab] = useState<FilterType>("all");
  const params =
    tab === "all"
      ? (me?.role === "hr" ? ({ self: "1" } as any) : undefined)
      : ({ type: tab, ...(me?.role === "hr" ? { self: "1" } : {}) } as any);
  const queryKey = getListGeneralRequestsQueryKey(params);
  const { data, isLoading } = useListGeneralRequests(params, {
    query: { queryKey },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GeneralRequest | null>(null);

  const onEdit = (r: GeneralRequest) => {
    setEditing(r);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description="Submit and track requests — half-day, remote work, loan, PF withdrawal, increment, resignation, and more."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> New request
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterType)}>
        <TabsList className="flex-wrap bg-card">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="half_day">Half Day</TabsTrigger>
          <TabsTrigger value="late">Late</TabsTrigger>
          <TabsTrigger value="remote_work">Remote Work</TabsTrigger>
          <TabsTrigger value="loan">Loan</TabsTrigger>
          <TabsTrigger value="pf_withdrawal">PF Withdrawal</TabsTrigger>
          <TabsTrigger value="increment">Increment</TabsTrigger>
          <TabsTrigger value="resignation">Resignation</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Tagged</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : !data || data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No requests yet.
                </TableCell>
              </TableRow>
            ) : (
              data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="secondary">{TYPE_LABEL[r.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{formatDateShort(r.date)}</span>
                    {(r as any).dateTo && (r as any).dateTo !== r.date && (
                      <span className="text-muted-foreground"> → {formatDateShort((r as any).dateTo)}</span>
                    )}
                    {(r.attachments ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(r.attachments ?? []).map((a, i) => (
                          <a
                            key={`${a.url}-${i}`}
                            href={a.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            {a.name.length > 20 ? a.name.slice(0, 20) + "…" : a.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.amount != null ? formatCurrency(r.amount) : "—"}
                  </TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">
                    <ReasonCell
                      reason={r.reason}
                      title="Request reason"
                      description={
                        <span>
                          {TYPE_LABEL[r.type]} • {formatDateShort(r.date)}
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {(r.mentionedEmployees ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(r.mentionedEmployees ?? []).map((m) => (
                          <Badge key={m.id} variant="secondary" className="text-xs">
                            @{m.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <RowActions r={r} onEdit={() => onEdit(r)} />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.appliedAt)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <RequestDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
      />
    </div>
  );
}

function RowActions({
  r,
  onEdit,
}: {
  r: GeneralRequest;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const del = useDeleteGeneralRequest();
  const onCancel = () => {
    if (!confirm("Cancel this request?")) return;
    del.mutate(
      { id: r.id },
      {
        onSuccess: () => {
          toast.success("Request cancelled");
          qc.invalidateQueries({
            queryKey: getListGeneralRequestsQueryKey().slice(0, 1),
          });
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not cancel"),
      },
    );
  };
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={onCancel}
        aria-label="Cancel"
        disabled={del.isPending}
      >
        <Trash2 className="h-4 w-4 text-rose-600" />
      </Button>
    </div>
  );
}

function RequestDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: GeneralRequest | null;
}) {
  const qc = useQueryClient();
  const create = useCreateGeneralRequest();
  const update = useUpdateGeneralRequest();
  const { data: me } = useGetMe();
  const employeeId = me?.employeeId ?? 0;
  const { data: employee } = useGetEmployee(employeeId, {
    query: {
      queryKey: getGetEmployeeQueryKey(employeeId),
      enabled: open && employeeId > 0,
    },
  });
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const { data: eligibility } = useGetMyLoanEligibility({
    query: {
      queryKey: getGetMyLoanEligibilityQueryKey(),
      enabled: open,
    },
  });
  const { data: payslips } = useGetMyPayslips({
    query: {
      queryKey: getGetMyPayslipsQueryKey(),
      enabled: open && employeeId > 0,
    },
  });
  const { data: pfRequests } = useListGeneralRequests(
    { type: "pf_withdrawal" as any, ...(me?.role === "hr" ? { self: "1" } : {}) } as any,
    {
      query: {
        queryKey: getListGeneralRequestsQueryKey({
          type: "pf_withdrawal" as any,
          ...(me?.role === "hr" ? { self: "1" } : {}),
        } as any),
        enabled: open && employeeId > 0,
      },
    },
  );
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<GeneralRequestType>("half_day");
  const [date, setDate] = useState(today);
  const [dateTo, setDateTo] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [installmentMonths, setInstallmentMonths] = useState<string>("");
  const [reason, setReason] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentions, setMentions] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setDate(editing.date);
      setDateTo((editing as any).dateTo ?? "");
      setAmount(editing.amount != null ? String(editing.amount) : "");
      setInstallmentMonths(
        editing.installmentMonths != null
          ? String(editing.installmentMonths)
          : "",
      );
      setReason(editing.reason);
      setAttachments(editing.attachments ?? []);
      setMentions(editing.mentionedEmployeeIds ?? []);
    } else {
      setType("half_day");
      setDate(today);
      setDateTo("");
      setAmount("");
      setInstallmentMonths(
        settings?.loanDefaultMonths ? String(settings.loanDefaultMonths) : "",
      );
      setReason("");
      setAttachments([]);
      setMentions([]);
    }
  }, [open, editing, today, settings?.loanDefaultMonths]);

  const requiresAmount = type === "loan" || type === "increment";
  const requiresPfAmount = (type as string) === "pf_withdrawal";
  const supportsDateRange =
    type === "half_day" || type === "remote_work" || type === "late";
  const pfSummary =
    employee && payslips
      ? buildProvidentFundSummary(
          employee,
          payslips,
          (pfRequests ?? []).filter((request) => request.id !== editing?.id),
        )
      : null;

  // Day-count for the "Selected" preview box
  const dayCount = useMemo(() => {
    if (!date) return 0;
    if (!supportsDateRange || !dateTo || dateTo <= date) return 1;
    const a = new Date(date + "T00:00:00Z").getTime();
    const b = new Date(dateTo + "T00:00:00Z").getTime();
    return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
  }, [date, dateTo, supportsDateRange]);

  const monthlyInstallment =
    type === "loan" &&
    Number(amount) > 0 &&
    Number(installmentMonths) > 0
      ? Number(amount) / Number(installmentMonths)
      : 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if ((requiresAmount || requiresPfAmount) && (!amount || Number(amount) <= 0)) {
      toast.error("Amount is required");
      return;
    }
    if (type === "loan") {
      const months = Number(installmentMonths);
      if (!months || months < 1) {
        toast.error("Choose how many months to repay over");
        return;
      }
      if (eligibility && !eligibility.eligible) {
        toast.error(eligibility.reason ?? "Not eligible for a loan yet");
        return;
      }
      if (eligibility && Number(amount) > eligibility.maxAmount) {
        toast.error(
          `Loan amount exceeds your limit of ${formatCurrency(eligibility.maxAmount)}`,
        );
        return;
      }
    }
    if ((type as string) === "pf_withdrawal") {
      if (!pfSummary) {
        toast.error("PF summary is still loading");
        return;
      }
      if (!pfSummary.canWithdraw) {
        toast.error(
          `PF withdrawal becomes available after ${formatDate(pfSummary.eligibleAfterDate)}`,
        );
        return;
      }
      if (Number(amount) > pfSummary.availableToRequest) {
        toast.error(
          `Withdrawal amount exceeds available PF balance of ${formatCurrency(pfSummary.availableToRequest)}`,
        );
        return;
      }
    }
    const payload = {
      type,
      date: date as unknown as string,
      dateTo: supportsDateRange && dateTo && dateTo > date ? dateTo : undefined,
      amount: requiresAmount || requiresPfAmount ? Number(amount) : null,
      installmentMonths:
        type === "loan" && Number(installmentMonths) > 0
          ? Number(installmentMonths)
          : undefined,
      reason,
      attachmentUrl: attachments[0]?.url ?? null,
      attachmentName: attachments[0]?.name ?? null,
      attachments,
      mentionedEmployeeIds: mentions,
    };
    const onSuccess = () => {
      toast.success(editing ? "Request updated" : "Request submitted");
      qc.invalidateQueries({
        queryKey: getListGeneralRequestsQueryKey().slice(0, 1),
      });
      onOpenChange(false);
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not submit request");

    if (editing) {
      update.mutate({ id: editing.id, data: payload as any }, { onSuccess, onError });
    } else {
      create.mutate({ data: payload as any }, { onSuccess, onError });
    }
  };

  const pending = create.isPending || update.isPending;
  const excludeIds = me?.employeeId ? [me.employeeId] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit request" : "New request"}
          </DialogTitle>
          <DialogDescription>
            Submit a workplace request and track its status.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => {
                setType(v as GeneralRequestType);
                setDateTo("");
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="half_day">Half Day</SelectItem>
                <SelectItem value="late">Late Arrival</SelectItem>
                <SelectItem value="remote_work">Remote Work</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
                <SelectItem value="pf_withdrawal">PF Withdrawal</SelectItem>
                <SelectItem value="increment">Salary Increment</SelectItem>
                <SelectItem value="resignation">Resignation</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                {type === "loan"
                  ? "Need by date"
                  : (type as string) === "pf_withdrawal"
                    ? "Withdrawal date"
                  : type === "increment"
                    ? "Effective date"
                    : supportsDateRange
                      ? "From"
                      : "Date"}
              </Label>
              <DateField
                required
                value={date}
                onChange={setDate}
              />
            </div>
            {supportsDateRange && (
              <div className="space-y-1.5">
                <Label>To (optional)</Label>
                <DateField
                  value={dateTo}
                  min={date}
                  onChange={setDateTo}
                />
              </div>
            )}
            {(requiresAmount || requiresPfAmount) && (
              <div className="space-y-1.5">
                <Label>
                  {(type as string) === "pf_withdrawal"
                    ? "Withdrawal amount (PKR)"
                    : "Amount (PKR)"}
                </Label>
                <Input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50000"
                />
              </div>
            )}
            {type === "loan" && (
              <div className="space-y-1.5">
                <Label>Repay over (months)</Label>
                <Input
                  required
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={installmentMonths}
                  onChange={(e) => setInstallmentMonths(e.target.value)}
                  placeholder={String(settings?.loanDefaultMonths ?? 6)}
                />
              </div>
            )}
          </div>
          {type === "loan" && eligibility && (
            <div
              className={
                "rounded-md border px-3 py-2 text-xs " +
                (eligibility.eligible
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100")
              }
            >
              {eligibility.eligible ? (
                <>
                  You can borrow up to{" "}
                  <span className="font-semibold">
                    {formatCurrency(eligibility.maxAmount)}
                  </span>
                  . Tenure: {eligibility.currentTenureMonths} mo · required ≥{" "}
                  {eligibility.minTenureMonths} mo.
                </>
              ) : (
                <>{eligibility.reason ?? "Not eligible for a loan yet."}</>
              )}
            </div>
          )}
          {(type as string) === "pf_withdrawal" && pfSummary && (
            <div
              className={
                "rounded-md border px-3 py-2 text-xs " +
                (pfSummary.canWithdraw
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                  : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100")
              }
            >
              {pfSummary.canWithdraw ? (
                <>
                  Available PF balance:{" "}
                  <span className="font-semibold">
                    {formatCurrency(pfSummary.availableToRequest)}
                  </span>
                  . PF starts after probation, company matches each employee contribution, and withdrawal is allowed after 1 year of service.
                </>
              ) : (
                <>
                  PF withdrawal becomes available after{" "}
                  <span className="font-semibold">
                    {formatDate(pfSummary.eligibleAfterDate)}
                  </span>
                  . Current PF balance: {formatCurrency(pfSummary.currentBalance)}.
                </>
              )}
            </div>
          )}
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Selected:</span>{" "}
            <span className="font-medium">{formatDateShort(date)}</span>
            {supportsDateRange && dateTo && dateTo > date && (
              <span className="text-muted-foreground"> → <span className="font-medium text-foreground">{formatDateShort(dateTo)}</span></span>
            )}
            {(type === "half_day" ||
              type === "remote_work" ||
              type === "late") && (
              <>
                <span className="ml-3 text-muted-foreground">·</span>
                <span className="ml-2 font-semibold text-foreground">
                  {dayCount} {dayCount === 1 ? "day" : "days"}
                </span>
                {type === "half_day" && (
                  <span className="ml-1 text-muted-foreground">
                    ({(dayCount * 0.5).toFixed(1)} working day equivalent)
                  </span>
                )}
              </>
            )}
            {(requiresAmount || requiresPfAmount) && amount && Number(amount) > 0 && (
              <>
                <span className="ml-3 text-muted-foreground">·</span>
                <span className="ml-2 font-semibold text-primary">
                  {formatCurrency(Number(amount))}
                </span>
                {type === "loan" && monthlyInstallment > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ≈ {formatCurrency(monthlyInstallment)}/month
                  </span>
                )}
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Brief justification for your manager..."
            />
          </div>
          <MultiAttachmentField value={attachments} onChange={setAttachments} />
          <EmployeeMentionSelect
            value={mentions}
            onChange={setMentions}
            excludeIds={excludeIds}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving..."
                : editing
                  ? "Save changes"
                  : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
