import { useEffect, useState } from "react";
import {
  useListGeneralRequests,
  useApproveGeneralRequest,
  useRejectGeneralRequest,
  useGetEmployee,
  useGetEmployeePayslips,
  getListGeneralRequestsQueryKey,
  getGetAdminDashboardQueryKey,
  useGetSettings,
  getGetEmployeeQueryKey,
  getGetEmployeePayslipsQueryKey,
  getGetSettingsQueryKey,
  type GeneralRequest,
  type GeneralRequestType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, PiggyBank, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ReasonCell } from "@/components/ReasonCell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { ListGeneralRequestsParams } from "@workspace/api-client-react";
import { formatCurrency, formatDate, formatDateShort } from "@/lib/utils";
import { buildProvidentFundSummary } from "@/lib/providentFund";

type FilterStatus = "all" | "pending" | "approved" | "rejected";
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

export function AdminRequestsPage() {
  const [status, setStatus] = useState<FilterStatus>("pending");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const params: ListGeneralRequestsParams = {};
  if (status !== "all") params.status = status;
  if (typeFilter !== "all") params.type = typeFilter as any;
  const hasParams = Object.keys(params).length > 0;
  const queryKey = getListGeneralRequestsQueryKey(hasParams ? params : undefined);
  const { data, isLoading } = useListGeneralRequests(
    hasParams ? params : undefined,
    { query: { queryKey } },
  );

  const qc = useQueryClient();
  const approve = useApproveGeneralRequest();
  const reject = useRejectGeneralRequest();
  const { data: settings } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });
  const [loanDialog, setLoanDialog] = useState<GeneralRequest | null>(null);
  const [pfDialog, setPfDialog] = useState<GeneralRequest | null>(null);
  const { data: pfEmployee } = useGetEmployee(pfDialog?.employeeId ?? 0, {
    query: {
      queryKey: getGetEmployeeQueryKey(pfDialog?.employeeId ?? 0),
      enabled: !!pfDialog?.employeeId,
    },
  });
  const { data: pfPayslips } = useGetEmployeePayslips(pfDialog?.employeeId ?? 0, {
    query: {
      queryKey: getGetEmployeePayslipsQueryKey(pfDialog?.employeeId ?? 0),
      enabled: !!pfDialog?.employeeId,
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: getListGeneralRequestsQueryKey().slice(0, 1),
    });
    qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
  };

  const onApprove = (r: GeneralRequest) => {
    if (r.type === "loan") {
      setLoanDialog(r);
      return;
    }
    if ((r.type as string) === "pf_withdrawal") {
      setPfDialog(r);
      return;
    }
    approve.mutate(
      { id: r.id, data: {} },
      {
        onSuccess: () => {
          toast.success("Request approved");
          invalidate();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not approve"),
      },
    );
  };

  const onReject = (r: GeneralRequest) => {
    reject.mutate(
      { id: r.id },
      {
        onSuccess: () => {
          toast.success("Request rejected");
          invalidate();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not reject"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Requests"
        description="Approve or reject half-day, loan, PF withdrawal, increment, and other employee requests."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onValueChange={(v) => setStatus(v as FilterStatus)}>
          <TabsList className="bg-card">
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as FilterType)}>
          <TabsList className="flex-wrap bg-card">
            <TabsTrigger value="all">All types</TabsTrigger>
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
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Loading requests...
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No requests in this view.
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={r.employeeName ?? ""} size="sm" />
                      <span className="font-medium">{r.employeeName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{TYPE_LABEL[r.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{formatDateShort(r.date)}</span>
                    {(r as any).dateTo && (r as any).dateTo !== r.date && (
                      <span className="text-muted-foreground"> → {formatDateShort((r as any).dateTo)}</span>
                    )}
                    {r.attachmentUrl && r.attachmentName && (
                      <a
                        href={r.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs text-primary hover:underline"
                      >
                        ({r.attachmentName.length > 20 ? r.attachmentName.slice(0, 20) + "…" : r.attachmentName})
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <span>{r.amount != null ? formatCurrency(r.amount) : "—"}</span>
                      {(r.type as string) === "pf_withdrawal" && (
                        <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <PiggyBank className="h-3 w-3" />
                          PF request
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">
                    <ReasonCell
                      reason={r.reason}
                      title="Request reason"
                      description={
                        <span>
                          {r.employeeName} • {TYPE_LABEL[r.type]} •{" "}
                          {formatDateShort(r.date)}
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => onApprove(r)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => onReject(r)}
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
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

      <ApproveLoanDialog
        request={loanDialog}
        defaultMonths={settings?.loanDefaultMonths ?? 6}
        onClose={() => setLoanDialog(null)}
        onApproved={() => {
          invalidate();
          setLoanDialog(null);
        }}
      />

      <ApprovePfWithdrawalDialog
        request={pfDialog}
        employee={pfEmployee ?? null}
        payslips={pfPayslips ?? []}
        requests={(data ?? []).filter((item) => item.employeeId === pfDialog?.employeeId)}
        onClose={() => setPfDialog(null)}
        onApproved={() => {
          invalidate();
          setPfDialog(null);
        }}
      />
    </div>
  );
}

function ApproveLoanDialog({
  request,
  defaultMonths,
  onClose,
  onApproved,
}: {
  request: GeneralRequest | null;
  defaultMonths: number;
  onClose: () => void;
  onApproved: () => void;
}) {
  const approve = useApproveGeneralRequest();
  const [months, setMonths] = useState<string>(String(defaultMonths));

  const open = !!request;
  useEffect(() => {
    if (request) {
      setMonths(String(request.installmentMonths ?? defaultMonths));
    }
  }, [request, defaultMonths]);

  if (!request) return null;
  const m = Number(months);
  const monthly = m > 0 && request.amount ? request.amount / m : 0;

  const onConfirm = () => {
    if (!m || m < 1) {
      toast.error("Enter installment months");
      return;
    }
    approve.mutate(
      { id: request.id, data: { installmentMonths: m } },
      {
        onSuccess: () => {
          toast.success("Loan approved");
          onApproved();
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not approve"),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve loan request</DialogTitle>
          <DialogDescription>
            {request.employeeName} requested {formatCurrency(request.amount ?? 0)}.
            You can override the installment months before approving.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Installment months</Label>
            <Input
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Employee proposed {request.installmentMonths ?? defaultMonths} month(s).
              Default {defaultMonths}.
            </p>
          </div>
          {monthly > 0 && (
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm">
              Per-month deduction:{" "}
              <span className="font-semibold text-primary">
                {formatCurrency(monthly)}
              </span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={approve.isPending}>
            {approve.isPending ? "Approving..." : "Approve loan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApprovePfWithdrawalDialog({
  request,
  employee,
  payslips,
  requests,
  onClose,
  onApproved,
}: {
  request: GeneralRequest | null;
  employee: any | null;
  payslips: any[];
  requests: GeneralRequest[];
  onClose: () => void;
  onApproved: () => void;
}) {
  const approve = useApproveGeneralRequest();
  if (!request) return null;

  const summary =
    employee != null
      ? buildProvidentFundSummary(employee, payslips, requests)
      : null;

  const requestedAmount = Number(request.amount ?? 0);
  const exceedsAvailable =
    summary != null && requestedAmount > summary.availableToRequest;

  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve PF withdrawal</DialogTitle>
          <DialogDescription>
            Review current PF balance before approving {request.employeeName}'s withdrawal request.
          </DialogDescription>
        </DialogHeader>

        {!summary ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            Loading PF balance...
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <PfMiniCard label="Requested amount" value={formatCurrency(requestedAmount)} tone="down" />
              <PfMiniCard label="Current PF balance" value={formatCurrency(summary.currentBalance)} />
              <PfMiniCard label="Pending withdrawals" value={formatCurrency(summary.pendingWithdrawals)} />
              <PfMiniCard label="Available now" value={formatCurrency(summary.availableToRequest)} />
            </div>
            <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-3 text-sm">
              <p className="font-medium text-foreground">{request.reason}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Eligible after {formatDate(summary.eligibleAfterDate)}. PF starts counting after probation.
              </p>
            </div>
            {exceedsAvailable && (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Requested amount exceeds currently available PF balance. Backend will also block approval.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={approve.isPending || !summary || exceedsAvailable}
            onClick={() =>
              approve.mutate(
                { id: request.id, data: {} },
                {
                  onSuccess: () => {
                    toast.success("PF withdrawal approved");
                    onApproved();
                  },
                  onError: (err) =>
                    toast.error(err instanceof Error ? err.message : "Could not approve"),
                },
              )
            }
          >
            {approve.isPending ? "Approving..." : "Approve withdrawal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PfMiniCard({
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
      <p className={`mt-1 text-base font-semibold ${tone === "down" ? "text-rose-600" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
