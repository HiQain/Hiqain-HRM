import {
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import { employeesTable } from "./employees";
import { usersTable } from "./users";

export const inventoryItemsTable = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 255 }).notNull(),
  sku: varchar("sku", { length: 128 }),
  totalStock: int("total_stock").notNull().default(0),
  availableStock: int("available_stock").notNull().default(0),
  reorderLevel: int("reorder_level").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

export const inventoryRequestsTable = mysqlTable("inventory_requests", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  itemId: int("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  quantity: int("quantity").notNull().default(1),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"])
    .notNull()
    .default("pending"),
  adminNotes: text("admin_notes"),
  requestedAt: timestamp("requested_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedByUserId: int("reviewed_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
});

export const inventoryAssignmentsTable = mysqlTable("inventory_assignments", {
  id: int("id").autoincrement().primaryKey(),
  employeeId: int("employee_id")
    .notNull()
    .references(() => employeesTable.id, { onDelete: "cascade" }),
  itemId: int("item_id")
    .notNull()
    .references(() => inventoryItemsTable.id, { onDelete: "cascade" }),
  requestId: int("request_id").references(() => inventoryRequestsTable.id, {
    onDelete: "set null",
  }),
  quantity: int("quantity").notNull().default(1),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  returnedAt: timestamp("returned_at"),
  assignedByUserId: int("assigned_by_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
});

export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
export type InventoryRequest = typeof inventoryRequestsTable.$inferSelect;
export type InventoryAssignment = typeof inventoryAssignmentsTable.$inferSelect;
