import { Router, type IRouter } from "express";
import { db, salaryComponentsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { CreateSalaryComponentBody, UpdateSalaryComponentBody } from "@workspace/api-zod";
import { getUser, requireAuth } from "../lib/auth";

const router: IRouter = Router();

function serialize(c: typeof salaryComponentsTable.$inferSelect) {
  return {
    id: c.id,
    employeeId: c.employeeId,
    label: c.label,
    kind: c.kind,
    valueType: c.valueType,
    value: Number(c.value),
    isDeduction: c.isDeduction === 1,
    isTaxable: c.isTaxable === 1,
    sortOrder: c.sortOrder,
  };
}

router.get(
  "/employees/:id/salary-components",
  requireAuth(),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const user = getUser(req);
    if (user.role === "employee" && user.employeeId !== id) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    const rows = await db
      .select()
      .from(salaryComponentsTable)
      .where(eq(salaryComponentsTable.employeeId, id))
      .orderBy(asc(salaryComponentsTable.sortOrder), asc(salaryComponentsTable.id));
    res.json(rows.map(serialize));
  },
);

router.post(
  "/employees/:id/salary-components",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = CreateSalaryComponentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }
    const data = parsed.data;
    const inserted = await db
      .insert(salaryComponentsTable)
      .values({
        employeeId: id,
        label: data.label,
        kind: data.kind,
        valueType: data.valueType,
        value: String(data.value),
        isDeduction: data.isDeduction ? 1 : 0,
        isTaxable: data.isTaxable === false ? 0 : 1,
      })
      .$returningId();
    const componentId = inserted[0]?.id;
    if (!componentId) {
      res.status(500).json({ message: "Failed to create salary component" });
      return;
    }
    const rows = await db
      .select()
      .from(salaryComponentsTable)
      .where(eq(salaryComponentsTable.id, componentId))
      .limit(1);
    const component = rows[0];
    if (!component) {
      res.status(500).json({ message: "Created salary component not found" });
      return;
    }
    res.status(201).json(serialize(component));
  },
);

router.patch(
  "/employees/:id/salary-components/:componentId",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const componentId = Number(req.params.componentId);
    const parsed = UpdateSalaryComponentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }
    const data = parsed.data;
    const updateResult = await db
      .update(salaryComponentsTable)
      .set({
        label: data.label,
        kind: data.kind,
        valueType: data.valueType,
        value: String(data.value),
        isDeduction: data.isDeduction ? 1 : 0,
        isTaxable: data.isTaxable === false ? 0 : 1,
      })
      .where(
        and(
          eq(salaryComponentsTable.id, componentId),
          eq(salaryComponentsTable.employeeId, id),
        ),
      );

    if (!updateResult[0].affectedRows) {
      res.status(404).json({ message: "Salary component not found" });
      return;
    }
    const rows = await db
      .select()
      .from(salaryComponentsTable)
      .where(
        and(
          eq(salaryComponentsTable.id, componentId),
          eq(salaryComponentsTable.employeeId, id),
        ),
      )
      .limit(1);
    const component = rows[0];
    if (!component) {
      res.status(404).json({ message: "Salary component not found" });
      return;
    }
    res.json(serialize(component));
  },
);

router.delete(
  "/employees/:id/salary-components/:componentId",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const componentId = Number(req.params.componentId);
    await db
      .delete(salaryComponentsTable)
      .where(
        and(
          eq(salaryComponentsTable.id, componentId),
          eq(salaryComponentsTable.employeeId, id),
        ),
      );
    res.json({ success: true });
  },
);

export default router;
