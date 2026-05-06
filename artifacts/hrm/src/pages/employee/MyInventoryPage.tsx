import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListInventoryItemsQueryKey,
  getListMyInventoryAssignmentsQueryKey,
  getListMyInventoryRequestsQueryKey,
  useCreateMyInventoryRequest,
  useListInventoryItems,
  useListMyInventoryAssignments,
  useListMyInventoryRequests,
} from "@workspace/api-client-react";
import { CheckCircle2, Package, Plus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

export function MyInventoryPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");

  const { data: items, isLoading: itemsLoading } = useListInventoryItems();
  const { data: requests, isLoading: requestsLoading } = useListMyInventoryRequests();
  const { data: assignments, isLoading: assignmentsLoading } = useListMyInventoryAssignments();
  const createRequest = useCreateMyInventoryRequest();

  const availableItems = items ?? [];
  const stats = useMemo(
    () => ({
      availableSkus: availableItems.length,
      activeAssignments: (assignments ?? []).filter((assignment) => assignment.active).length,
      pendingRequests: (requests ?? []).filter((request) => request.status === "pending").length,
      approvedRequests: (requests ?? []).filter((request) => request.status === "approved").length,
    }),
    [assignments, availableItems.length, requests],
  );

  const resetDialog = () => {
    setSelectedItemId("");
    setQuantity("1");
    setReason("");
    setDialogOpen(false);
  };

  const submitRequest = (event: FormEvent) => {
    event.preventDefault();
    const itemId = Number(selectedItemId);
    if (!itemId) {
      toast.error("Select an inventory item first");
      return;
    }

    createRequest.mutate(
      {
        data: {
          itemId,
          quantity: Math.max(1, Number(quantity || 1)),
          reason: reason.trim() || undefined,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Inventory request submitted");
          resetDialog();
          await Promise.all([
            qc.invalidateQueries({ queryKey: getListInventoryItemsQueryKey() }),
            qc.invalidateQueries({ queryKey: getListMyInventoryRequestsQueryKey() }),
            qc.invalidateQueries({ queryKey: getListMyInventoryAssignmentsQueryKey() }),
          ]);
        },
        onError: (error: Error) => {
          toast.error(error.message || "Could not submit request");
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Request extra hardware, track approval status, and see the equipment currently assigned to you."
        actions={
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New inventory request
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available Items" value={stats.availableSkus} icon={Package} tone="info" />
        <StatCard label="Assigned to Me" value={stats.activeAssignments} icon={Wrench} tone="success" />
        <StatCard label="Pending Requests" value={stats.pendingRequests} icon={Plus} tone="warning" />
        <StatCard label="Approved Requests" value={stats.approvedRequests} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">Available stock</h2>
              <p className="text-sm text-muted-foreground">
                Request any item you need for work. Approved requests are assigned automatically.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      Loading available stock...
                    </TableCell>
                  </TableRow>
                ) : !availableItems.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No stock is currently available.
                    </TableCell>
                  </TableRow>
                ) : (
                  availableItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        {item.notes && (
                          <div className="max-w-xs truncate text-xs text-muted-foreground">
                            {item.notes}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>{item.sku || "—"}</TableCell>
                      <TableCell>{item.availableStock}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-lg font-semibold">My request history</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      Loading requests...
                    </TableCell>
                  </TableRow>
                ) : !requests?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      You have not submitted any inventory requests yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{request.itemName}</TableCell>
                      <TableCell>{request.quantity}</TableCell>
                      <TableCell className="max-w-sm text-muted-foreground">
                        {request.reason || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell>{formatDate(request.requestedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </section>
        </div>

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-lg font-semibold">Assigned to me</h2>
            <p className="text-sm text-muted-foreground">
              These items have already been approved and issued against your employee profile.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignmentsLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Loading assignments...
                  </TableCell>
                </TableRow>
              ) : !assignments?.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    No inventory has been assigned to you yet.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div className="font-medium">{assignment.itemName}</div>
                      {assignment.notes && (
                        <div className="max-w-xs truncate text-xs text-muted-foreground">
                          {assignment.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{assignment.quantity}</TableCell>
                    <TableCell>{formatDate(assignment.assignedAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={assignment.active ? "approved" : "rejected"} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New inventory request</DialogTitle>
            <DialogDescription>
              Request hardware or accessories such as a monitor, RAM, SSD, keyboard, or any other approved stock item.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitRequest}>
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an available item" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name} · {item.category} · {item.availableStock} available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Tell HR or admin why you need this item"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={createRequest.isPending}>
                Submit request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
