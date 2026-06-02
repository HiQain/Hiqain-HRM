import { useState } from "react";
import {
  useListLeaves,
  useApproveLeave,
  useRejectLeave,
  getListLeavesQueryKey,
  getGetAdminDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { EmployeeAvatar } from "@/components/EmployeeAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ReasonCell } from "@/components/ReasonCell";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/utils";

type FilterStatus = "all" | "pending" | "approved" | "rejected";

export function AdminLeavesPage() {
  const [tab, setTab] = useState<FilterStatus>("pending");
  const params = tab === "all" ? undefined : { status: tab };
  const queryKey = getListLeavesQueryKey(params);
  const { data, isLoading, isError } = useListLeaves(params, { query: { queryKey } });

  const qc = useQueryClient();
  const approve = useApproveLeave();
  const reject = useRejectLeave();

  const onAct = (id: number, action: "approve" | "reject") => {
    const m = action === "approve" ? approve : reject;
    m.mutate(
      { id },
      {
        onSuccess: () => {
          toast.success(action === "approve" ? "Leave approved" : "Leave rejected");
          qc.invalidateQueries({ queryKey: getListLeavesQueryKey() });
          qc.invalidateQueries({ queryKey: getListLeavesQueryKey({ status: "pending" }) });
          qc.invalidateQueries({ queryKey: getListLeavesQueryKey({ status: "approved" }) });
          qc.invalidateQueries({ queryKey: getListLeavesQueryKey({ status: "rejected" }) });
          qc.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
        },
        onError: () => toast.error("Could not update request"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave requests"
        description="Approve or reject pending leave requests from your team."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as FilterStatus)}>
        <TabsList className="bg-card">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-center">Days</TableHead>
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
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Leave requests load nahin ho sakin. Page refresh karke dobara try karein.
                </TableCell>
              </TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No leave requests in this view.
                </TableCell>
              </TableRow>
            ) : (
              (data ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <EmployeeAvatar name={l.employeeName} size="sm" />
                      <span className="font-medium">{l.employeeName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{l.type}</TableCell>
                  <TableCell>
                    {formatDate(l.startDate)} – {formatDate(l.endDate)}
                  </TableCell>
                  <TableCell className="text-center">{l.days}</TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">
                    <ReasonCell
                      reason={l.reason}
                      title="Leave reason"
                      description={
                        <span className="capitalize">
                          {l.employeeName} • {l.type} •{" "}
                          <span className="normal-case">
                            {formatDate(l.startDate)} – {formatDate(l.endDate)}
                          </span>
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell className="text-right">
                    {l.status === "pending" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => onAct(l.id, "approve")}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-700 hover:bg-rose-50"
                          onClick={() => onAct(l.id, "reject")}
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(l.appliedAt)}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
