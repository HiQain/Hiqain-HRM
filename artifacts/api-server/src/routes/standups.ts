import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  employeesTable,
  usersTable,
} from "@workspace/db";
import { standupEntriesTable } from "../../../../lib/db/src/schema/standupEntries";
import { getUser, requireAuth } from "../lib/auth";

const router: IRouter = Router();

const StandupEntryBody = z.object({
  id: z.number().int().positive().optional(),
  project: z.string().trim(),
  working: z.string().trim(),
});

const StandupDayBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(StandupEntryBody),
});

const UpdateStandupBody = z.object({
  days: z.array(StandupDayBody),
});

function sanitizeStandupDays(days: Array<z.infer<typeof StandupDayBody>>) {
  return days
    .map((day) => ({
      date: day.date,
      entries:
        day.entries.length > 0
          ? day.entries.map((entry) => ({
              project: entry.project.trim(),
              working: entry.working.trim(),
            }))
          : [{ project: "", working: "" }],
    }));
}

async function replaceEmployeeStandupSheet(
  employeeId: number,
  days: Array<z.infer<typeof StandupDayBody>>,
) {
  const sanitizedDays = sanitizeStandupDays(days);

  await db
    .delete(standupEntriesTable)
    .where(eq(standupEntriesTable.employeeId, employeeId));

  const values = sanitizedDays.flatMap((day) =>
    day.entries.map((entry, index) => ({
      employeeId,
      standupDate: day.date,
      sortOrder: index,
      project: entry.project,
      working: entry.working,
    })),
  );

  if (values.length > 0) {
    await db.insert(standupEntriesTable).values(values);
  }
}

function serializeStandupDays(
  rows: Array<typeof standupEntriesTable.$inferSelect>,
) {
  const grouped = new Map<
    string,
    Array<{
      id: number;
      project: string;
      working: string;
      sortOrder: number;
    }>
  >();

  for (const row of rows) {
    const entries = grouped.get(row.standupDate) ?? [];
    entries.push({
      id: row.id,
      project: row.project,
      working: row.working,
      sortOrder: row.sortOrder,
    });
    grouped.set(row.standupDate, entries);
  }

  return Array.from(grouped.entries()).map(([date, entries]) => ({
    date,
    entries,
  }));
}

async function getEmployeeSheet(employeeId: number) {
  const rows = await db
    .select({
      entry: standupEntriesTable,
      employeeId: employeesTable.id,
      employeeName: employeesTable.name,
      employeePosition: employeesTable.position,
      employeeDepartment: employeesTable.department,
      employeeAvatarUrl: employeesTable.avatarUrl,
      employeeEmail: usersTable.email,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .leftJoin(
      standupEntriesTable,
      eq(standupEntriesTable.employeeId, employeesTable.id),
    )
    .where(eq(employeesTable.id, employeeId))
    .orderBy(
      asc(standupEntriesTable.standupDate),
      asc(standupEntriesTable.sortOrder),
      asc(standupEntriesTable.id),
    );

  const first = rows[0];
  if (!first) return null;

  return {
    employee: {
      id: first.employeeId,
      name: first.employeeName,
      email: first.employeeEmail,
      position: first.employeePosition,
      department: first.employeeDepartment,
      avatarUrl: first.employeeAvatarUrl,
    },
    days: serializeStandupDays(
      rows
        .map((row) => row.entry)
        .filter(
          (
            entry,
          ): entry is NonNullable<typeof rows[number]["entry"]> => Boolean(entry),
        ),
    ),
  };
}

router.get("/standups/me", requireAuth(["employee", "hr"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.status(404).json({ message: "Employee profile not found" });
    return;
  }

  const sheet = await getEmployeeSheet(user.employeeId);
  if (!sheet) {
    res.status(404).json({ message: "Employee profile not found" });
    return;
  }

  res.json(sheet);
});

router.put("/standups/me", requireAuth(["employee", "hr"]), async (req, res) => {
  const user = getUser(req);
  if (!user.employeeId) {
    res.status(404).json({ message: "Employee profile not found" });
    return;
  }

  const parsed = UpdateStandupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid standup payload" });
    return;
  }

  await replaceEmployeeStandupSheet(user.employeeId, parsed.data.days);

  const sheet = await getEmployeeSheet(user.employeeId);
  res.json(sheet);
});

router.get(
  "/standups/employees/:id",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      res.status(400).json({ message: "Invalid employee id" });
      return;
    }

    const sheet = await getEmployeeSheet(employeeId);
    if (!sheet) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    res.json(sheet);
  },
);

router.put(
  "/standups/employees/:id",
  requireAuth(["admin"]),
  async (req, res) => {
    const employeeId = Number(req.params.id);
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      res.status(400).json({ message: "Invalid employee id" });
      return;
    }

    const parsed = UpdateStandupBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid standup payload" });
      return;
    }

    const existingSheet = await getEmployeeSheet(employeeId);
    if (!existingSheet) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    await replaceEmployeeStandupSheet(employeeId, parsed.data.days);

    const sheet = await getEmployeeSheet(employeeId);
    res.json(sheet);
  },
);

export default router;
