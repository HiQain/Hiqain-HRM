import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  useListLeaves,
  useApplyLeave,
  useUpdateLeave,
  useDeleteLeave,
  useGetMyLeaveBalance,
  getListLeavesQueryKey,
  getGetMyLeaveBalanceQueryKey,
  getGetEmployeeDashboardQueryKey,
  type LeaveRequest,
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
import { Progress } from "@/components/ui/progress";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGetMe } from "@workspace/api-client-react";
import { daysBetweenInclusive, formatDate, formatDateShort } from "@/lib/utils";

export function MyLeavesPage() {
  const { data: me } = useGetMe();
  const leaveParams = me?.role === "hr" ? ({ self: "1" } as any) : undefined;
  const { data: balance } = useGetMyLeaveBalance();
  const { data: leaves, isLoading } = useListLeaves(leaveParams as any, {
    query: { queryKey: getListLeavesQueryKey(leaveParams as any) },
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveRequest | null>(null);

  const onEdit = (l: LeaveRequest) => {
    setEditing(l);
    setOpen(true);
  };
  const onCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaves"
        description="Apply for time off and track the status of your requests."
        actions={
          <Button onClick={onCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Apply for leave
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <BalanceCard
          label="Sick leave"
          used={balance?.sickUsed ?? 0}
          total={balance?.sick ?? 0}
          tone="emerald"
        />
        <BalanceCard
          label="Casual leave"
          used={balance?.casualUsed ?? 0}
          total={balance?.casual ?? 0}
          tone="amber"
        />
        <BalanceCard
          label="Annual leave"
          used={balance?.annualUsed ?? 0}
          total={balance?.annual ?? 0}
          tone="indigo"
        />
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-center">Days</TableHead>
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
            ) : (leaves ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  You haven't applied for any leaves yet.
                </TableCell>
              </TableRow>
            ) : (
              (leaves ?? []).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="capitalize">{l.type}</TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {formatDateShort(l.startDate)} – {formatDateShort(l.endDate)}
                    </span>
                    {(l.attachments ?? []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(l.attachments ?? []).map((a, i) => (
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
                  <TableCell className="text-center">{l.days}</TableCell>
                  <TableCell className="max-w-xs text-muted-foreground">
                    <ReasonCell
                      reason={l.reason}
                      title="Leave reason"
                      description={
                        <span className="capitalize">
                          {l.type} •{" "}
                          <span className="normal-case">
                            {formatDate(l.startDate)} – {formatDate(l.endDate)}
                          </span>
                        </span>
                      }
                    />
                  </TableCell>
                  <TableCell>
                    {(l.mentionedEmployees ?? []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(l.mentionedEmployees ?? []).map((m) => (
                          <Badge key={m.id} variant="secondary" className="text-xs">
                            @{m.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell className="text-right">
                    {l.status === "pending" ? (
                      <RowActions leave={l} onEdit={() => onEdit(l)} />
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

      <ApplyLeaveDialog
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

function RowActions({ leave, onEdit }: { leave: LeaveRequest; onEdit: () => void }) {
  const qc = useQueryClient();
  const del = useDeleteLeave();
  const onCancel = () => {
    if (!confirm("Cancel this leave request?")) return;
    del.mutate(
      { id: leave.id },
      {
        onSuccess: () => {
          toast.success("Request cancelled");
          qc.invalidateQueries({ queryKey: getListLeavesQueryKey() });
          qc.invalidateQueries({ queryKey: getGetMyLeaveBalanceQueryKey() });
          qc.invalidateQueries({ queryKey: getGetEmployeeDashboardQueryKey() });
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

function BalanceCard({
  label,
  used,
  total,
  tone,
}: {
  label: string;
  used: number;
  total: number;
  tone: "emerald" | "amber" | "indigo";
}) {
  const remaining = Math.max(0, total - used);
  const pct = total ? Math.min(100, (used / total) * 100) : 0;
  const tones = {
    emerald: "from-emerald-500 to-green-600",
    amber: "from-amber-500 to-orange-500",
    indigo: "from-indigo-500 to-violet-600",
  };
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className={`bg-gradient-to-r ${tones[tone]} px-5 py-3 text-white`}>
        <p className="text-xs font-medium uppercase tracking-wide opacity-90">
          {label}
        </p>
      </div>
      <div className="p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-3xl font-semibold tracking-tight">{remaining}</p>
          <p className="text-sm text-muted-foreground">days remaining</p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {used} used out of {total}
        </p>
        <Progress value={pct} className="mt-3 h-1.5" />
      </div>
    </div>
  );
}

function ApplyLeaveDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: LeaveRequest | null;
}) {
  const qc = useQueryClient();
  const apply = useApplyLeave();
  const update = useUpdateLeave();
  const { data: me } = useGetMe();
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState<"sick" | "casual" | "annual">("casual");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mentions, setMentions] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setStartDate(editing.startDate);
      setEndDate(editing.endDate);
      setReason(editing.reason);
      setAttachments(editing.attachments ?? []);
      setMentions(editing.mentionedEmployeeIds ?? []);
    } else {
      setType("casual");
      setStartDate(today);
      setEndDate(today);
      setReason("");
      setAttachments([]);
      setMentions([]);
    }
  }, [open, editing, today]);

  const days = useMemo(
    () => daysBetweenInclusive(startDate, endDate),
    [startDate, endDate],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      type,
      startDate: startDate as unknown as string,
      endDate: endDate as unknown as string,
      reason,
      attachmentUrl: attachments[0]?.url ?? null,
      attachmentName: attachments[0]?.name ?? null,
      attachments,
      mentionedEmployeeIds: mentions,
    };
    const onSuccess = () => {
      toast.success(editing ? "Leave updated" : "Leave request sent for approval");
      qc.invalidateQueries({ queryKey: getListLeavesQueryKey() });
      qc.invalidateQueries({ queryKey: getGetMyLeaveBalanceQueryKey() });
      qc.invalidateQueries({ queryKey: getGetEmployeeDashboardQueryKey() });
      onOpenChange(false);
    };
    const onError = (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not submit request");

    if (editing) {
      update.mutate({ id: editing.id, data: payload }, { onSuccess, onError });
    } else {
      apply.mutate({ data: payload }, { onSuccess, onError });
    }
  };

  const pending = apply.isPending || update.isPending;
  const excludeIds = me?.employeeId ? [me.employeeId] : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit leave request" : "Apply for leave"}
          </DialogTitle>
          <DialogDescription>
            Pick the dates you'll be off and add a brief reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as typeof type)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sick">Sick leave</SelectItem>
                <SelectItem value="casual">Casual leave</SelectItem>
                <SelectItem value="annual">Annual leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <DateField
                required
                value={startDate}
                onChange={setStartDate}
              />
            </div>
            <div className="space-y-1.5">
              <Label>End date</Label>
              <DateField
                required
                value={endDate}
                onChange={setEndDate}
                min={startDate}
              />
            </div>
          </div>
          <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Selected:</span>{" "}
            <span className="font-medium">
              {formatDateShort(startDate)} – {formatDateShort(endDate)}
            </span>
            <span className="ml-3 text-muted-foreground">·</span>
            <span className="ml-2 font-semibold text-primary">
              {days} day{days === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="A short note for your manager..."
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
            <Button type="submit" disabled={pending || days < 1}>
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
