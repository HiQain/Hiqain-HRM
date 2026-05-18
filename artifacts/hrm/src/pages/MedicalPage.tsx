import {
  getListEmployeesQueryKey,
  useGetMe,
  useListEmployees,
} from "@workspace/api-client-react";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMedicalSummary } from "@/lib/medical";
import { formatCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";

type MedicalMode = "admin" | "employee";

export function MedicalPage({ mode }: { mode: MedicalMode }) {
  const isAdminMode = mode === "admin";
  const { data: me } = useGetMe();
  const { data: employees } = useListEmployees({
    query: { enabled: isAdminMode, queryKey: getListEmployeesQueryKey() },
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  useEffect(() => {
    if (isAdminMode) {
      if (!selectedEmployeeId && employees?.length) {
        setSelectedEmployeeId(employees[0].id);
      }
      return;
    }
    if (me?.employeeId) {
      setSelectedEmployeeId(me.employeeId);
    }
  }, [employees, isAdminMode, me?.employeeId, selectedEmployeeId]);

  const summary = useMedicalSummary(selectedEmployeeId ?? undefined);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical"
        description={
          isAdminMode
            ? "Manage yearly IPD allowance and per-day limits."
            : "View your yearly IPD medical allowance and covered family members."
        }
      />

      {isAdminMode ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="max-w-sm space-y-1.5">
            <Label>Select employee</Label>
            <Select
              value={selectedEmployeeId ? String(selectedEmployeeId) : ""}
              onValueChange={(value) => setSelectedEmployeeId(Number(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose employee" />
              </SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((employee) => (
                  <SelectItem key={employee.id} value={String(employee.id)}>
                    {employee.name} ({employee.department || "No department"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          label="Medical status"
          value={summary.data?.medicalEnabled ? "Enabled" : "Disabled"}
          hint="Coverage access"
        />
        <SummaryCard
          label="Per day limit"
          value={
            summary.data ? formatCurrency(summary.data.limits.daily) : "—"
          }
          hint="Daily IPD limit"
        />
        <SummaryCard
          label="Yearly IPD allowance"
          value={
            summary.data ? formatCurrency(summary.data.limits.overall) : "—"
          }
          hint="Year-wise total limit"
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <p className="text-sm font-semibold">Covered list</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(summary.data?.dependents ?? []).map((dependent) => (
            <div
              key={`${dependent.relation}-${dependent.name}`}
              className="rounded-full border border-border bg-muted/40 px-3 py-1 text-sm"
            >
              {dependent.name} ({dependent.relation})
            </div>
          ))}
          {!summary.data?.dependents?.length ? (
            <p className="text-sm text-muted-foreground">No covered family names found.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
