import { useState } from "react";
import {
  useListEmployees,
  useGetEmployeePayslips,
  useGeneratePayslip,
  getGetEmployeePayslipsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { FileDown, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PayslipView } from "@/components/PayslipView";
import { formatCurrency, formatDate, formatMonth } from "@/lib/utils";

export function AdminPayslipsPage() {
  const { data: employees } = useListEmployees();
  const now = new Date();
  const [empId, setEmpId] = useState<number | null>(null);
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());
  const [viewing, setViewing] = useState<any>(null);

  const { data: existing } = useGetEmployeePayslips(empId ?? 0, {
    query: {
      queryKey: getGetEmployeePayslipsQueryKey(empId ?? 0),
      enabled: !!empId,
    },
  });

  const qc = useQueryClient();
  const generate = useGeneratePayslip();

  // Block current month and future months
  const isFutureOrCurrent =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month >= now.getMonth() + 1);

  const onGenerate = () => {
    if (!empId) return;
    if (isFutureOrCurrent) {
      toast.error("Cannot generate payslips for the current or future months");
      return;
    }
    generate.mutate(
      { data: { employeeId: empId, month, year } },
      {
        onSuccess: (p) => {
          toast.success(`Payslip ready for ${formatMonth(month, year)}`);
          qc.invalidateQueries({
            queryKey: getGetEmployeePayslipsQueryKey(empId),
          });
          setViewing(p);
        },
        onError: () => toast.error("Could not generate payslip"),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payslips"
        description="Generate monthly payslips, review history and download as PDF."
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Employee</Label>
          <Select
            value={empId ? String(empId) : ""}
            onValueChange={(v) => setEmpId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an employee..." />
            </SelectTrigger>
            <SelectContent>
              {(employees ?? []).map((e) => (
                <SelectItem key={e.id} value={String(e.id)}>
                  {e.name} · {e.position ?? ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Month</Label>
          <Select
            value={String(month)}
            onValueChange={(v) => setMonth(Number(v))}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }).map((_, i) => (
                <SelectItem key={i} value={String(i + 1)}>
                  {formatMonth(i + 1, year)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Year</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
        <div className="sm:col-span-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onGenerate}
              disabled={!empId || generate.isPending || isFutureOrCurrent}
              className="w-full sm:w-auto"
            >
              <Wand2 className="mr-2 h-4 w-4" />
              {generate.isPending ? "Generating..." : "Generate payslip"}
            </Button>
          </div>
          {isFutureOrCurrent && (
            <p className="text-xs text-amber-600">
              Payslips can only be generated for completed past months.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border p-4">
          <p className="text-sm font-semibold">
            {empId
              ? `Payslip history for ${(employees ?? []).find((e) => e.id === empId)?.name ?? ""}`
              : "Pick an employee to view their payslip history"}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Working days</TableHead>
              <TableHead>Present / Late</TableHead>
              <TableHead>Generated</TableHead>
              <TableHead className="text-right">Net salary</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!empId ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Select an employee to begin.
                </TableCell>
              </TableRow>
            ) : (existing ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No payslips yet for this employee.
                </TableCell>
              </TableRow>
            ) : (
              (existing ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {formatMonth(p.month, p.year)}
                  </TableCell>
                  <TableCell>{p.totalWorkingDays}</TableCell>
                  <TableCell>{p.presentDays} / {p.lateCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(p.generatedAt)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(p.netSalary)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2"
                      onClick={() => setViewing(p)}
                    >
                      <FileDown className="h-4 w-4" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl flex flex-col max-h-[90vh]">
          <DialogHeader className="shrink-0">
            <DialogTitle>Payslip</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            {viewing && <PayslipView payslip={viewing} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
