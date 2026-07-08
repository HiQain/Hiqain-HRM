import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import {
  db,
  employeesTable,
  pool,
  usersTable,
} from "@workspace/db";
import { standupEntriesTable } from "../../../../lib/db/src/schema/standupEntries";
import { getUser, requireAuth } from "../lib/auth";

const router: IRouter = Router();
const DEFAULT_STANDUP_COLUMN_WIDTH = 220;
const DEFAULT_PROJECT_COLUMN_WIDTH = 180;
const DEFAULT_WORKING_COLUMN_WIDTH = 360;
const MIN_STANDUP_COLUMN_WIDTH = 140;

const StandupColumnBody = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  width: z.number().int().min(MIN_STANDUP_COLUMN_WIDTH).max(1200).optional(),
  kind: z.enum(["system", "custom"]).optional(),
});

const StandupEntryBody = z.object({
  id: z.number().int().positive().optional(),
  project: z.string(),
  working: z.string(),
  extraValues: z.record(z.string(), z.string()).optional(),
});

const StandupDayBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entries: z.array(StandupEntryBody),
});

const UpdateStandupBody = z.object({
  days: z.array(StandupDayBody),
  columns: z.array(StandupColumnBody).optional(),
});

type StandupColumn = z.infer<typeof StandupColumnBody>;
let ensuredStandupColumnsStorage = false;

function normalizeStandupColumns(columns?: StandupColumn[] | null): StandupColumn[] {
  const seen = new Set<string>();
  const normalized: StandupColumn[] = [];
  const incomingProjectWidth = columns?.find((column) => column.key === "project")?.width;
  const incomingWorkingWidth = columns?.find((column) => column.key === "working")?.width;
  const projectWidth = incomingProjectWidth ?? DEFAULT_PROJECT_COLUMN_WIDTH;
  const workingWidth =
    incomingWorkingWidth == null || incomingWorkingWidth <= projectWidth
      ? Math.max(DEFAULT_WORKING_COLUMN_WIDTH, projectWidth + 120)
      : incomingWorkingWidth;

  const addColumn = (column: StandupColumn) => {
    const key = column.key.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push({
      key,
      label: column.label.trim() || key,
      width:
        typeof column.width === "number"
          ? Math.min(Math.max(column.width, MIN_STANDUP_COLUMN_WIDTH), 1200)
          : key === "project"
            ? DEFAULT_PROJECT_COLUMN_WIDTH
            : key === "working"
              ? DEFAULT_WORKING_COLUMN_WIDTH
              : DEFAULT_STANDUP_COLUMN_WIDTH,
      kind: column.kind ?? (key === "project" || key === "working" ? "system" : "custom"),
    });
  };

  addColumn({
    key: "project",
    label:
      columns?.find((column) => column.key === "project")?.label ?? "Project",
    width: projectWidth,
    kind: "system",
  });
  addColumn({
    key: "working",
    label:
      columns?.find((column) => column.key === "working")?.label ?? "Working",
    width: workingWidth,
    kind: "system",
  });

  for (const column of columns ?? []) {
    if (column.key === "project" || column.key === "working") continue;
    addColumn({
      ...column,
      kind: "custom",
    });
  }

  return normalized;
}

async function ensureStandupColumnsStorage() {
  if (ensuredStandupColumnsStorage) return;

  const [databaseRows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS db");
  const databaseName = databaseRows[0]?.["db"];
  if (typeof databaseName !== "string" || !databaseName) {
    throw new Error("Could not determine current database name");
  }

  const [columnRows] = await pool.execute<(RowDataPacket & { column_name: string })[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = 'app_settings'
       AND column_name = 'standup_columns'`,
    [databaseName],
  );

  if (columnRows.length === 0) {
    try {
      await pool.query(
        "ALTER TABLE `app_settings` ADD COLUMN `standup_columns` JSON NULL AFTER `public_holidays`",
      );
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      if (code !== "ER_DUP_FIELDNAME") {
        throw error;
      }
    }
  }

  ensuredStandupColumnsStorage = true;
}

async function getStandupColumns(): Promise<StandupColumn[]> {
  await ensureStandupColumnsStorage();
  const [rows] = await pool.query<(RowDataPacket & { standup_columns?: string | StandupColumn[] | null })[]>(
    "SELECT standup_columns FROM app_settings ORDER BY id ASC LIMIT 1",
  );
  const rawValue = rows[0]?.standup_columns;
  const parsedValue =
    typeof rawValue === "string"
      ? (JSON.parse(rawValue) as StandupColumn[])
      : Array.isArray(rawValue)
        ? rawValue
        : [];
  return normalizeStandupColumns(parsedValue);
}

async function saveStandupColumns(columns: StandupColumn[]) {
  await ensureStandupColumnsStorage();
  const normalized = normalizeStandupColumns(columns);
  const [rows] = await pool.query<(RowDataPacket & { id: number })[]>(
    "SELECT id FROM app_settings ORDER BY id ASC LIMIT 1",
  );

  if (rows[0]?.id) {
    await pool.execute(
      "UPDATE app_settings SET standup_columns = ? WHERE id = ?",
      [JSON.stringify(normalized), rows[0].id],
    );
    return normalized;
  }

  await pool.execute(
    "INSERT INTO app_settings (standup_columns) VALUES (?)",
    [JSON.stringify(normalized)],
  );
  return normalized;
}

function sanitizeStandupDays(days: Array<z.infer<typeof StandupDayBody>>) {
  return days
    .map((day) => ({
      date: day.date,
      entries:
        day.entries.length > 0
          ? day.entries.map((entry) => ({
              project: entry.project.replace(/\r\n/g, "\n"),
              working: entry.working.replace(/\r\n/g, "\n"),
              extraValues: Object.fromEntries(
                Object.entries(entry.extraValues ?? {}).map(([key, value]) => [
                  key,
                  value.replace(/\r\n/g, "\n"),
                ]),
              ),
            }))
          : [{ project: "", working: "", extraValues: {} }],
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
      extraValues: entry.extraValues,
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
      extraValues: Record<string, string>;
      sortOrder: number;
    }>
  >();

  for (const row of rows) {
    const entries = grouped.get(row.standupDate) ?? [];
    entries.push({
      id: row.id,
      project: row.project,
      working: row.working,
      extraValues:
        (row as typeof row & { extraValues?: Record<string, string> }).extraValues ?? {},
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
  const columns = await getStandupColumns();
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
    columns,
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
    res.status(400).json({
      message: "Invalid standup payload",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
    return;
  }

  if (parsed.data.columns) {
    await saveStandupColumns(parsed.data.columns);
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
      res.status(400).json({
        message: "Invalid standup payload",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
      return;
    }

    const existingSheet = await getEmployeeSheet(employeeId);
    if (!existingSheet) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    await replaceEmployeeStandupSheet(employeeId, parsed.data.days);
    if (parsed.data.columns) {
      await saveStandupColumns(parsed.data.columns);
    }

    const sheet = await getEmployeeSheet(employeeId);
    res.json(sheet);
  },
);

export default router;
