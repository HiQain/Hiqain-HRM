import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListEmployeesQueryKey,
  getListInventoryAssignmentsQueryKey,
  getListInventoryItemsQueryKey,
  getListInventoryRequestsQueryKey,
  useApproveInventoryRequest,
  useCreateInventoryAssignment,
  useCreateInventoryItem,
  useListEmployees,
  useListInventoryAssignments,
  useListInventoryItems,
  useListInventoryRequests,
  useRejectInventoryRequest,
  useUpdateInventoryItem,
  type InventoryItem,
  type InventoryRequest,
} from "@workspace/api-client-react";
import { CheckCircle2, Package, Plus, ShieldAlert, Wrench, XCircle } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type StockFormState = {
  name: string;
  category: string;
  sku: string;
  totalStock: string;
  reorderLevel: string;
  notes: string;
};

type ReviewDialogState =
  | { mode: "approve" | "reject"; request: InventoryRequest }
  | null;

type AssignmentFormState = {
  employeeId: string;
  itemId: string;
  quantity: string;
  notes: string;
};

const EMPTY_STOCK_FORM: StockFormState = {
  name: "",
  category: "",
  sku: "",
  totalStock: "0",
  reorderLevel: "0",
  notes: "",
};

const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = {
  employeeId: "",
  itemId: "",
  quantity: "1",
  notes: "",
};

function toStockForm(item?: InventoryItem | null): StockFormState {
  if (!item) return EMPTY_STOCK_FORM;
  return {
    name: item.name,
    category: item.category,
    sku: item.sku ?? "",
    totalStock: String(item.totalStock),
    reorderLevel: String(item.reorderLevel),
    notes: item.notes ?? "",
  };
}

export function AdminInventoryPage() {
  const qc = useQueryClient();
  const [requestStatus, setRequestStatus] = useState<"all" | "pending" | "approved" | "rejected">(
    "pending",
  );
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [stockForm, setStockForm] = useState<StockFormState>(EMPTY_STOCK_FORM);
  const [reviewDialog, setReviewDialog] = useState<ReviewDialogState>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAdminNotes, setReviewAdminNotes] = useState("");
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(
    EMPTY_ASSIGNMENT_FORM,
  );

  const { data: employees } = useListEmployees({
    query: { queryKey: getListEmployeesQueryKey() },
  });
  const { data: items, isLoading: itemsLoading } = useListInventoryItems();
  const { data: requests, isLoading: requestsLoading } = useListInventoryRequests(
    requestStatus === "all" ? undefined : { status: requestStatus },
  );
  const { data: assignments, isLoading: assignmentsLoading } = useListInventoryAssignments();

  const createItem = useCreateInventoryItem();
  const updateItem = useUpdateInventoryItem();
  const createAssignment = useCreateInventoryAssignment();
  const approveRequest = useApproveInventoryRequest();
  const rejectRequest = useRejectInventoryRequest();

  const stats = useMemo(() => {
    const inventory = items ?? [];
    const pendingRequests = (requests ?? []).filter((request) => request.status === "pending").length;
    return {
      totalSkus: inventory.length,
      availableUnits: inventory.reduce((sum, item) => sum + item.availableStock, 0),
      assignedUnits: inventory.reduce((sum, item) => sum + item.assignedStock, 0),
      lowStockItems: inventory.filter((item) => item.availableStock <= item.reorderLevel).length,
      pendingRequests,
      activeAssignments: (assignments ?? []).filter((assignment) => assignment.active).length,
    };
  }, [assignments, items, requests]);

  const invalidateInventory = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListInventoryItemsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListInventoryRequestsQueryKey() }),
      qc.invalidateQueries({ queryKey: getListInventoryRequestsQueryKey({ status: "pending" }) }),
      qc.invalidateQueries({ queryKey: getListInventoryRequestsQueryKey({ status: "approved" }) }),
      qc.invalidateQueries({ queryKey: getListInventoryRequestsQueryKey({ status: "rejected" }) }),
      qc.invalidateQueries({ queryKey: getListInventoryAssignmentsQueryKey() }),
    ]);
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setStockForm(EMPTY_STOCK_FORM);
    setItemDialogOpen(true);
  };

  const openAssignmentDialog = () => {
    setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
    setAssignmentDialogOpen(true);
  };

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    setStockForm(toStockForm(item));
    setItemDialogOpen(true);
  };

  const submitItem = (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      name: stockForm.name.trim(),
      category: stockForm.category.trim(),
      sku: stockForm.sku.trim() || null,
      totalStock: Math.max(0, Number(stockForm.totalStock || 0)),
      reorderLevel: Math.max(0, Number(stockForm.reorderLevel || 0)),
      notes: stockForm.notes.trim() || null,
    };

    const onSuccess = async () => {
      toast.success(editingItem ? "Inventory item updated" : "Inventory item created");
      setItemDialogOpen(false);
      setEditingItem(null);
      setStockForm(EMPTY_STOCK_FORM);
      await invalidateInventory();
    };
    const onError = (error: Error) => {
      toast.error(error.message || "Could not save inventory item");
    };

    if (editingItem) {
      updateItem.mutate({ id: editingItem.id, data: payload }, { onSuccess, onError });
      return;
    }
    createItem.mutate({ data: payload }, { onSuccess, onError });
  };

  const openReviewDialog = (mode: "approve" | "reject", request: InventoryRequest) => {
    setReviewDialog({ mode, request });
    setReviewNotes("");
    setReviewAdminNotes("");
  };

  const submitReview = () => {
    if (!reviewDialog) return;
    const payload = {
      notes: reviewNotes.trim() || undefined,
      adminNotes: reviewAdminNotes.trim() || undefined,
    };
    const mutation =
      reviewDialog.mode === "approve" ? approveRequest : rejectRequest;

    mutation.mutate(
      { id: reviewDialog.request.id, data: payload },
      {
        onSuccess: async () => {
          toast.success(
            reviewDialog.mode === "approve"
              ? "Inventory request approved"
              : "Inventory request rejected",
          );
          setReviewDialog(null);
          await invalidateInventory();
        },
        onError: (error: Error) => {
          toast.error(error.message || "Could not review request");
        },
      },
    );
  };

  const submitAssignment = (event: FormEvent) => {
    event.preventDefault();
    if (!assignmentForm.employeeId || !assignmentForm.itemId) {
      toast.error("Select both employee and inventory item");
      return;
    }

    createAssignment.mutate(
      {
        data: {
          employeeId: Number(assignmentForm.employeeId),
          itemId: Number(assignmentForm.itemId),
          quantity: Math.max(1, Number(assignmentForm.quantity || 1)),
          notes: assignmentForm.notes.trim() || undefined,
        },
      },
      {
        onSuccess: async () => {
          toast.success("Inventory assigned");
          setAssignmentDialogOpen(false);
          setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
          await invalidateInventory();
        },
        onError: (error: Error) => {
          toast.error(error.message || "Could not assign inventory");
        },
      },
    );
  };

  const availableItems = (items ?? []).filter((item) => item.availableStock > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Manage stock, review employee hardware requests, and track what has been assigned to each employee."
        actions={
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
            <Button onClick={openAssignmentDialog} variant="outline" className="w-full">
              Assign inventory manually
            </Button>
            <Button onClick={openCreateDialog} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Add inventory item
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total SKUs" value={stats.totalSkus} icon={Package} tone="info" />
        <StatCard label="Available Units" value={stats.availableUnits} icon={CheckCircle2} tone="success" />
        <StatCard label="Assigned Units" value={stats.assignedUnits} icon={Wrench} tone="warning" />
        <StatCard label="Low Stock Items" value={stats.lowStockItems} icon={ShieldAlert} tone="danger" />
      </div>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList className="flex-wrap bg-card">
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Reorder</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      Loading inventory...
                    </TableCell>
                  </TableRow>
                ) : !items?.length ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                      No inventory items added yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
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
                      <TableCell>{item.totalStock}</TableCell>
                      <TableCell>{item.availableStock}</TableCell>
                      <TableCell>{item.assignedStock}</TableCell>
                      <TableCell>{item.reorderLevel}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={item.availableStock <= item.reorderLevel ? "rejected" : "approved"}
                          className="capitalize"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openEditDialog(item)}>
                          Edit stock
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "pending", "approved", "rejected"] as const).map((status) => (
              <Button
                key={status}
                variant={requestStatus === status ? "default" : "outline"}
                size="sm"
                onClick={() => setRequestStatus(status)}
                className="capitalize"
              >
                {status}
              </Button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading requests...
                    </TableCell>
                  </TableRow>
                ) : !requests?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No inventory requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>{request.employeeName}</TableCell>
                      <TableCell>{request.itemName}</TableCell>
                      <TableCell>{request.quantity}</TableCell>
                      <TableCell className="max-w-sm text-muted-foreground">
                        {request.reason || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell>{formatDate(request.requestedAt)}</TableCell>
                      <TableCell className="text-right">
                        {request.status === "pending" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReviewDialog("reject", request)}
                            >
                              Reject
                            </Button>
                            <Button size="sm" onClick={() => openReviewDialog("approve", request)}>
                              Approve
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {request.reviewedAt ? `Reviewed ${formatDate(request.reviewedAt)}` : "Reviewed"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      Loading assignments...
                    </TableCell>
                  </TableRow>
                ) : !assignments?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      No inventory assignments yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>{assignment.employeeName}</TableCell>
                      <TableCell>{assignment.itemName}</TableCell>
                      <TableCell>{assignment.quantity}</TableCell>
                      <TableCell>{formatDate(assignment.assignedAt)}</TableCell>
                      <TableCell className="max-w-sm text-muted-foreground">
                        {assignment.notes || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={assignment.active ? "approved" : "rejected"} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit inventory item" : "Add inventory item"}</DialogTitle>
            <DialogDescription>
              Track stock centrally so approved employee requests can be assigned automatically.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitItem}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={stockForm.name}
                  onChange={(event) =>
                    setStockForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  value={stockForm.category}
                  onChange={(event) =>
                    setStockForm((current) => ({ ...current, category: event.target.value }))
                  }
                  placeholder="Monitor, SSD, RAM..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>SKU</Label>
                <Input
                  value={stockForm.sku}
                  onChange={(event) =>
                    setStockForm((current) => ({ ...current, sku: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total stock</Label>
                <Input
                  type="number"
                  min={0}
                  value={stockForm.totalStock}
                  onChange={(event) =>
                    setStockForm((current) => ({ ...current, totalStock: event.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reorder level</Label>
                <Input
                  type="number"
                  min={0}
                  value={stockForm.reorderLevel}
                  onChange={(event) =>
                    setStockForm((current) => ({ ...current, reorderLevel: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={stockForm.notes}
                onChange={(event) =>
                  setStockForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Optional internal notes"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createItem.isPending || updateItem.isPending}>
                {editingItem ? "Save changes" : "Create item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignmentDialogOpen} onOpenChange={setAssignmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign inventory manually</DialogTitle>
            <DialogDescription>
              Issue stock directly to an employee without waiting for a request.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitAssignment}>
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select
                value={assignmentForm.employeeId}
                onValueChange={(value) =>
                  setAssignmentForm((current) => ({ ...current, employeeId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {(employees ?? []).map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.name} · {employee.employeeCode ?? "No code"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Inventory item</Label>
              <Select
                value={assignmentForm.itemId}
                onValueChange={(value) =>
                  setAssignmentForm((current) => ({ ...current, itemId: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
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
                value={assignmentForm.quantity}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={assignmentForm.notes}
                onChange={(event) =>
                  setAssignmentForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Optional issue note"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssignmentDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createAssignment.isPending}>
                {createAssignment.isPending ? "Assigning..." : "Assign item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewDialog)} onOpenChange={(open) => !open && setReviewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.mode === "approve" ? "Approve request" : "Reject request"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog
                ? `${reviewDialog.request.employeeName} requested ${reviewDialog.request.quantity} ${reviewDialog.request.itemName}.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Assignment notes</Label>
              <Textarea
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="Optional note for the employee assignment"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Admin notes</Label>
              <Textarea
                value={reviewAdminNotes}
                onChange={(event) => setReviewAdminNotes(event.target.value)}
                placeholder="Optional internal review note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReviewDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitReview}
              variant={reviewDialog?.mode === "approve" ? "default" : "destructive"}
              disabled={approveRequest.isPending || rejectRequest.isPending}
            >
              {reviewDialog?.mode === "approve" ? "Approve and assign" : "Reject request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
