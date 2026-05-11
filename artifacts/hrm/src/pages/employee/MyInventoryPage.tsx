import { type FormEvent, useCallback, useMemo, useState } from "react";
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
  const [requestedItemName, setRequestedItemName] = useState("");
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

  const resetDialog = useCallback(() => {
    setRequestedItemName("");
    setQuantity("1");
    setReason("");
    setDialogOpen(false);
  }, []);

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const submitRequest = useCallback((event: FormEvent) => {
    event.preventDefault();
    const normalizedName = requestedItemName.trim();
    if (!normalizedName) {
      toast.error("Enter the item you need first");
      return;
    }
    const matchedItem = availableItems.find(
      (item) => item.name.trim().toLowerCase() === normalizedName.toLowerCase(),
    );

    createRequest.mutate(
      {
        data: {
          itemId: matchedItem?.id,
          requestedItemName: normalizedName,
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
  }, [availableItems, createRequest, qc, quantity, reason, requestedItemName, resetDialog]);

  const pageActions = useMemo(
    () => (
      <Button onClick={openDialog} className="gap-2">
        <Plus className="h-4 w-4" />
        New inventory request
      </Button>
    ),
    [openDialog],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Request extra hardware, track approval status, and see the equipment currently assigned to you."
        actions={pageActions}
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
              Request any hardware or accessory you need, even if it is not currently listed in stock.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitRequest}>
            <div className="space-y-1.5">
              <Label>Item</Label>
              <Input
                value={requestedItemName}
                onChange={(event) => setRequestedItemName(event.target.value)}
                placeholder="Enter the item you need"
                required
              />
              <p className="text-xs text-muted-foreground">
                You can enter a new item name even if it is not currently available in inventory.
              </p>
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
