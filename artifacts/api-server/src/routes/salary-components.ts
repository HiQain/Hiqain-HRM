import { Router, type IRouter } from "express";
import { db, salaryComponentsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import { CreateSalaryComponentBody } from "@workspace/api-zod";
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
    sortOrder: c.sortOrder,
  };
}

router.get(
  "/employees/:id/salary-components",
  requireAuth(),
  async (req, res) => {
    const id = Number(req.params.id);
    const user = getUser(req);
    if (user.role === "employee" && user.employeeId !== id) {
      return res.status(403).json({ message: "Forbidden" });
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
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = CreateSalaryComponentBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload" });
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
      })
      .returning();
    res.status(201).json(serialize(inserted[0]!));
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
