import { Router, type IRouter } from "express";
import {
  db,
  employeesTable,
  inventoryAssignmentsTable,
  inventoryItemsTable,
  inventoryRequestsTable,
  usersTable,
} from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import { notifyEmployeeUser, notifyRoles } from "../lib/notifications";

const router: IRouter = Router();

function serializeItem(row: typeof inventoryItemsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    sku: row.sku,
    totalStock: row.totalStock,
    availableStock: row.availableStock,
    assignedStock: Math.max(0, row.totalStock - row.availableStock),
    reorderLevel: row.reorderLevel,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRequest(
  row: typeof inventoryRequestsTable.$inferSelect,
  employeeName: string,
  itemName: string,
) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName,
    itemId: row.itemId,
    itemName,
    requestedItemName: row.requestedItemName ?? itemName,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    adminNotes: row.adminNotes,
    requestedAt: row.requestedAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewedByUserId: row.reviewedByUserId,
  };
}

function serializeAssignment(
  row: typeof inventoryAssignmentsTable.$inferSelect,
  employeeName: string,
  itemName: string,
) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName,
    itemId: row.itemId,
    itemName,
    requestId: row.requestId,
    quantity: row.quantity,
    notes: row.notes,
    active: row.active,
    assignedAt: row.assignedAt.toISOString(),
    returnedAt: row.returnedAt ? row.returnedAt.toISOString() : null,
    assignedByUserId: row.assignedByUserId,
  };
}

router.get("/inventory/items", requireAuth(), async (req, res): Promise<void> => {
  const user = getUser(req);
  const rows = await db
    .select()
    .from(inventoryItemsTable)
    .orderBy(asc(inventoryItemsTable.category), asc(inventoryItemsTable.name));

  const filtered =
    user.role === "employee"
      ? rows.filter((item) => item.availableStock > 0)
      : rows;
  res.json(filtered.map(serializeItem));
});

router.post("/inventory/items", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim();
  const category = body.category != null ? String(body.category).trim() : "General";
  const sku = body.sku ? String(body.sku).trim() : null;
  const totalStock = Math.max(0, Number(body.totalStock ?? 0));
  const reorderLevel = Math.max(0, Number(body.reorderLevel ?? 0));
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!name) {
    res.status(400).json({ message: "Name is required" });
    return;
  }

  const inserted = await db
    .insert(inventoryItemsTable)
    .values({
      name,
      category,
      sku,
      totalStock,
      availableStock: totalStock,
      reorderLevel,
      notes,
    })
    .$returningId();
  const itemId = inserted[0]?.id;
  const rows = itemId
    ? await db
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.id, itemId))
        .limit(1)
    : [];
  res.status(201).json(serializeItem(rows[0]!));
});

router.patch("/inventory/items/:id", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const currentRows = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id))
    .limit(1);
  const current = currentRows[0];
  if (!current) {
    res.status(404).json({ message: "Inventory item not found" });
    return;
  }

  const body = req.body ?? {};
  const nextTotalStock =
    body.totalStock == null ? current.totalStock : Math.max(0, Number(body.totalStock));
  const assignedStock = Math.max(0, current.totalStock - current.availableStock);
  if (nextTotalStock < assignedStock) {
    res.status(400).json({
      message: `Total stock cannot be less than already assigned quantity (${assignedStock})`,
    });
    return;
  }

  await db
    .update(inventoryItemsTable)
    .set({
      name: body.name != null ? String(body.name).trim() : current.name,
      category:
        body.category != null ? String(body.category).trim() || "General" : current.category,
      sku: body.sku != null ? String(body.sku).trim() : current.sku,
      totalStock: nextTotalStock,
      availableStock: nextTotalStock - assignedStock,
      reorderLevel:
        body.reorderLevel == null
          ? current.reorderLevel
          : Math.max(0, Number(body.reorderLevel)),
      notes: body.notes != null ? String(body.notes).trim() : current.notes,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(inventoryItemsTable.id, id));
  const rows = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id))
    .limit(1);
  res.json(serializeItem(rows[0]!));
});

router.delete("/inventory/items/:id", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const itemRows = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, id))
    .limit(1);
  const item = itemRows[0];
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" });
    return;
  }

  await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.id, id));
  res.json({ success: true });
});

router.get("/inventory/requests", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const status = req.query.status ? String(req.query.status) : null;
  const rows = await db
    .select({
      request: inventoryRequestsTable,
      employeeName: employeesTable.name,
      itemName: inventoryItemsTable.name,
    })
    .from(inventoryRequestsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, inventoryRequestsTable.employeeId))
    .leftJoin(inventoryItemsTable, eq(inventoryItemsTable.id, inventoryRequestsTable.itemId))
    .where(status ? eq(inventoryRequestsTable.status, status as any) : undefined)
    .orderBy(desc(inventoryRequestsTable.requestedAt));
  res.json(
    rows.map((row) =>
      serializeRequest(
        row.request,
        row.employeeName,
        row.request.requestedItemName ?? row.itemName ?? "Custom item request",
      ),
    ),
  );
});

router.get("/inventory/requests/me", requireAuth(["employee"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.json([]);
    return;
  }
  const rows = await db
    .select({
      request: inventoryRequestsTable,
      employeeName: employeesTable.name,
      itemName: inventoryItemsTable.name,
    })
    .from(inventoryRequestsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, inventoryRequestsTable.employeeId))
    .leftJoin(inventoryItemsTable, eq(inventoryItemsTable.id, inventoryRequestsTable.itemId))
    .where(eq(inventoryRequestsTable.employeeId, user.employeeId))
    .orderBy(desc(inventoryRequestsTable.requestedAt));
  res.json(
    rows.map((row) =>
      serializeRequest(
        row.request,
        row.employeeName,
        row.request.requestedItemName ?? row.itemName ?? "Custom item request",
      ),
    ),
  );
});

async function createInventoryRequestHandler(req: any, res: any): Promise<void> {
  const user = getUser(req);
  if (!user.employeeId) {
    res.status(400).json({ message: "No employee profile" });
    return;
  }
  const requestedItemName = req.body?.requestedItemName
    ? String(req.body.requestedItemName).trim()
    : "";
  const itemId = req.body?.itemId ? Number(req.body?.itemId) : null;
  const quantity = Math.max(1, Number(req.body?.quantity ?? 1));
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;
  if ((!itemId || !Number.isFinite(itemId)) && !requestedItemName) {
    res.status(400).json({ message: "Item name is required" });
    return;
  }
  let item: typeof inventoryItemsTable.$inferSelect | undefined;
  if (itemId && Number.isFinite(itemId)) {
    const itemRows = await db
      .select()
      .from(inventoryItemsTable)
      .where(eq(inventoryItemsTable.id, itemId))
      .limit(1);
    item = itemRows[0];
    if (!item) {
      res.status(404).json({ message: "Inventory item not found" });
      return;
    }
  }
  const empRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, user.employeeId))
    .limit(1);
  const employee = empRows[0]!;

  const inserted = await db
    .insert(inventoryRequestsTable)
    .values({
      employeeId: user.employeeId,
      itemId: item?.id ?? null,
      requestedItemName: requestedItemName || item?.name || null,
      quantity,
      reason,
    })
    .$returningId();
  const requestId = inserted[0]?.id;
  const rows = requestId
    ? await db
        .select()
        .from(inventoryRequestsTable)
        .where(eq(inventoryRequestsTable.id, requestId))
        .limit(1)
    : [];
  res.status(201).json(
    serializeRequest(
      rows[0]!,
      employee.name,
      rows[0]?.requestedItemName ?? item?.name ?? "Custom item request",
    ),
  );
  await notifyRoles(["admin", "hr"], {
    type: "inventory_request",
    title: "New inventory request",
    message: `${employee.name} submitted an inventory request.`,
    href: "/admin/inventory",
  });
  await notifyEmployeeUser(user.employeeId, {
    type: "inventory_request",
    title: "Inventory request submitted",
    message: "Your inventory request has been submitted for review.",
    href: "/employee/inventory",
  });
}

router.post("/inventory/requests", requireAuth(["employee", "hr"]), createInventoryRequestHandler);
router.post("/inventory/requests/me", requireAuth(["employee", "hr"]), createInventoryRequestHandler);

router.post("/inventory/requests/:id/approve", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const rows = await db
    .select({
      request: inventoryRequestsTable,
      employeeName: employeesTable.name,
      item: inventoryItemsTable,
    })
    .from(inventoryRequestsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, inventoryRequestsTable.employeeId))
    .leftJoin(inventoryItemsTable, eq(inventoryItemsTable.id, inventoryRequestsTable.itemId))
    .where(eq(inventoryRequestsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Inventory request not found" });
    return;
  }
  if (row.request.status !== "pending") {
    res.status(400).json({ message: "Request has already been reviewed" });
    return;
  }
  if (!row.item || !row.request.itemId) {
    res.status(400).json({
      message: "This request cannot be approved until a matching inventory item is available in stock.",
    });
    return;
  }
  if (row.item.availableStock < row.request.quantity) {
    res.status(400).json({ message: "Not enough stock available to approve this request" });
    return;
  }

  await db
    .update(inventoryItemsTable)
    .set({
      availableStock: row.item.availableStock - row.request.quantity,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(inventoryItemsTable.id, row.item.id));

  await db
    .insert(inventoryAssignmentsTable)
    .values({
      employeeId: row.request.employeeId,
      itemId: row.request.itemId,
      requestId: row.request.id,
      quantity: row.request.quantity,
      notes: req.body?.notes ? String(req.body.notes).trim() : row.request.reason,
      assignedByUserId: user.id,
    });

  await db
    .update(inventoryRequestsTable)
    .set({
      status: "approved",
      adminNotes: req.body?.adminNotes ? String(req.body.adminNotes).trim() : null,
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
    })
    .where(eq(inventoryRequestsTable.id, id));

  const updatedRows = await db
    .select()
    .from(inventoryRequestsTable)
    .where(eq(inventoryRequestsTable.id, id))
    .limit(1);
  res.json(
    serializeRequest(
      updatedRows[0]!,
      row.employeeName,
      updatedRows[0]?.requestedItemName ?? row.item.name,
    ),
  );
  await notifyEmployeeUser(row.request.employeeId, {
    type: "inventory_request",
    title: "Inventory request approved",
    message: "Your inventory request was approved and item assigned.",
    href: "/employee/inventory",
  });
});

router.post("/inventory/requests/:id/reject", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const id = Number(req.params.id);
  const rows = await db
    .select({
      request: inventoryRequestsTable,
      employeeName: employeesTable.name,
      itemName: inventoryItemsTable.name,
    })
    .from(inventoryRequestsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, inventoryRequestsTable.employeeId))
    .leftJoin(inventoryItemsTable, eq(inventoryItemsTable.id, inventoryRequestsTable.itemId))
    .where(eq(inventoryRequestsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Inventory request not found" });
    return;
  }
  if (row.request.status !== "pending") {
    res.status(400).json({ message: "Request has already been reviewed" });
    return;
  }
  await db
    .update(inventoryRequestsTable)
    .set({
      status: "rejected",
      adminNotes: req.body?.adminNotes ? String(req.body.adminNotes).trim() : null,
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
    })
    .where(eq(inventoryRequestsTable.id, id));
  const updatedRows = await db
    .select()
    .from(inventoryRequestsTable)
    .where(eq(inventoryRequestsTable.id, id))
    .limit(1);
  res.json(
    serializeRequest(
      updatedRows[0]!,
      row.employeeName,
      updatedRows[0]?.requestedItemName ?? row.itemName ?? "Custom item request",
    ),
  );
  await notifyEmployeeUser(row.request.employeeId, {
    type: "inventory_request",
    title: "Inventory request rejected",
    message: "Your inventory request was rejected.",
    href: "/employee/inventory",
  });
});

router.get("/inventory/assignments", requireAuth(["admin", "hr"]), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      assignment: inventoryAssignmentsTable,
      employeeName: employeesTable.name,
      itemName: inventoryItemsTable.name,
    })
    .from(inventoryAssignmentsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, inventoryAssignmentsTable.employeeId))
    .innerJoin(inventoryItemsTable, eq(inventoryItemsTable.id, inventoryAssignmentsTable.itemId))
    .orderBy(desc(inventoryAssignmentsTable.assignedAt));
  res.json(
    rows.map((row) =>
      serializeAssignment(row.assignment, row.employeeName, row.itemName),
    ),
  );
});

router.post("/inventory/assignments", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  const employeeId = Number(req.body?.employeeId);
  const itemId = Number(req.body?.itemId);
  const quantity = Math.max(1, Number(req.body?.quantity ?? 1));
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;
  const assignedAt =
    req.body?.assignedAt && String(req.body.assignedAt).trim()
      ? new Date(`${String(req.body.assignedAt).trim()}T00:00:00`)
      : new Date();

  if (!employeeId || !itemId) {
    res.status(400).json({ message: "employeeId and itemId are required" });
    return;
  }

  const employeeRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const employee = employeeRows[0];
  if (!employee) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }

  const itemRows = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, itemId))
    .limit(1);
  const item = itemRows[0];
  if (!item) {
    res.status(404).json({ message: "Inventory item not found" });
    return;
  }
  if (item.availableStock < quantity) {
    res.status(400).json({ message: "Not enough stock available to assign this item" });
    return;
  }

  await db
    .update(inventoryItemsTable)
    .set({
      availableStock: item.availableStock - quantity,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(inventoryItemsTable.id, item.id));

  const inserted = await db
    .insert(inventoryAssignmentsTable)
    .values({
      employeeId,
      itemId,
      quantity,
      notes,
      assignedAt,
      assignedByUserId: user.id,
    })
    .$returningId();
  const assignmentId = inserted[0]?.id;
  const rows = assignmentId
    ? await db
        .select()
        .from(inventoryAssignmentsTable)
        .where(eq(inventoryAssignmentsTable.id, assignmentId))
        .limit(1)
    : [];

  res.status(201).json(
    serializeAssignment(rows[0]!, employee.name, item.name),
  );
  await notifyEmployeeUser(employeeId, {
    type: "inventory_assignment",
    title: "Inventory item assigned",
    message: `${item.name} has been assigned to you.`,
    href: "/employee/inventory",
  });
});

router.get("/inventory/assignments/me", requireAuth(["employee", "hr"]), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.json([]);
    return;
  }
  const rows = await db
    .select({
      assignment: inventoryAssignmentsTable,
      employeeName: employeesTable.name,
      itemName: inventoryItemsTable.name,
    })
    .from(inventoryAssignmentsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, inventoryAssignmentsTable.employeeId))
    .innerJoin(inventoryItemsTable, eq(inventoryItemsTable.id, inventoryAssignmentsTable.itemId))
    .where(and(eq(inventoryAssignmentsTable.employeeId, user.employeeId), eq(inventoryAssignmentsTable.active, true)))
    .orderBy(desc(inventoryAssignmentsTable.assignedAt));
  res.json(
    rows.map((row) =>
      serializeAssignment(row.assignment, row.employeeName, row.itemName),
    ),
  );
});

export default router;
