import { useEffect, useState } from "react";
import {
  useListGeneralRequests,
  useApproveGeneralRequest,
  useRejectGeneralRequest,
  getListGeneralRequestsQueryKey,
  getGetAdminDashboardQueryKey,
  useGetSettings,
  getGetSettingsQueryKey,
  type GeneralRequest,
  type GeneralRequestType,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
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

type FilterStatus = "all" | "pending" | "approved" | "rejected";
type FilterType =
  | "all"
  | "half_day"
  | "loan"
  | "increment"
  | "remote_work"
  | "late"
  | "resignation"
  | "other";

const TYPE_LABEL: Record<GeneralRequestType, string> = {
  half_day: "Half Day",
  loan: "Loan",
  increment: "Increment",
  remote_work: "Remote Work",
  late: "Late",
  resignation: "Resignation",
  other: "Other",
};

export function AdminRequestsPage() {
  const [status, setStatus] = useState<FilterStatus>("pending");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const params: ListGeneralRequestsParams = {};
  if (status !== "all") params.status = status;
  if (typeFilter !== "all") params.type = typeFilter;
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
        description="Approve or reject half-day, loan, and increment requests."
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
                    {r.amount != null ? formatCurrency(r.amount) : "—"}
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
