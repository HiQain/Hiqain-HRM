import {
  useGetMe,
  useGetEmployee,
  useGetMyPayslips,
  useListGeneralRequests,
  getGetEmployeeQueryKey,
  getGetMyPayslipsQueryKey,
  getListGeneralRequestsQueryKey,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/PageHeader";
import { ProvidentFundLedgerCard } from "@/components/ProvidentFundLedgerCard";
import { Skeleton } from "@/components/ui/skeleton";
import { buildProvidentFundSummary } from "@/lib/providentFund";

export function MyProvidentFundPage() {
  const { data: me } = useGetMe();
  const employeeId = me?.employeeId ?? 0;
  const { data: employee, isLoading } = useGetEmployee(employeeId, {
    query: {
      queryKey: getGetEmployeeQueryKey(employeeId),
      enabled: employeeId > 0,
    },
  });
  const { data: payslips } = useGetMyPayslips({
    query: { queryKey: getGetMyPayslipsQueryKey(), enabled: employeeId > 0 },
  });
  const { data: pfRequests } = useListGeneralRequests(
    { type: "pf_withdrawal" as any, ...(me?.role === "hr" ? { self: "1" } : {}) } as any,
    {
      query: {
        queryKey: getListGeneralRequestsQueryKey({
          type: "pf_withdrawal" as any,
          ...(me?.role === "hr" ? { self: "1" } : {}),
        } as any),
        enabled: employeeId > 0,
      },
    },
  );

  if (isLoading || !employee) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const summary = buildProvidentFundSummary(employee, payslips ?? [], pfRequests ?? []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Provident Fund"
        description="View your PF contributions, company matching, withdrawals, and available balance separately from salary."
      />
      <ProvidentFundLedgerCard
        title="Provident fund ledger"
        description="PF starts counting after probation, and each employee contribution is matched by the company."
        summary={summary}
        emptyText="No PF contributions have been added yet."
      />
    </div>
  );
}
