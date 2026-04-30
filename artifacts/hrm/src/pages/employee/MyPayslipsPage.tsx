import { useState } from "react";
import {
  useGetMyPayslips,
  useGetPayslip,
  getGetPayslipQueryKey,
} from "@workspace/api-client-react";
import { Receipt } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PayslipView } from "@/components/PayslipView";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";

export function MyPayslipsPage() {
  const { data, isLoading } = useGetMyPayslips();
  const [openId, setOpenId] = useState<number | null>(null);

  const { data: detail } = useGetPayslip(openId ?? 0, {
    query: { enabled: !!openId, queryKey: getGetPayslipQueryKey(openId ?? 0) },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payslips"
        description="Past payslips, ready to view and download."
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No payslips yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Once HR generates your first payslip, it will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className="group rounded-xl border border-border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Payslip
                  </p>
                  <p className="mt-1 text-lg font-semibold">
                    {formatMonth(p.month, p.year)}
                  </p>
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Receipt className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-primary">
                {formatCurrency(p.netSalary)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Net salary
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center text-xs">
                <div>
                  <p className="text-muted-foreground">Working</p>
                  <p className="font-semibold">{p.totalWorkingDays}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Present</p>
                  <p className="font-semibold">{p.presentDays}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Late</p>
                  <p className="font-semibold">{p.lateCount}</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Generated {formatDate(p.generatedAt)}
              </p>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Your payslip</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            {detail && <PayslipView payslip={detail} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
