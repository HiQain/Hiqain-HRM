import { pool } from "@workspace/db";
import type { RowDataPacket } from "mysql2";
import { logger } from "./logger";

type ColumnRow = RowDataPacket & {
  column_name: string;
};

async function getCurrentDatabase(): Promise<string> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS db");
  const dbName = rows[0]?.["db"];
  if (typeof dbName !== "string" || !dbName) {
    throw new Error("Could not determine current database name");
  }
  return dbName;
}

async function getExistingColumns(
  tableName: string,
): Promise<Set<string>> {
  const dbName = await getCurrentDatabase();
  const [rows] = await pool.execute<ColumnRow[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = ?
       AND table_name = ?`,
    [dbName, tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

async function ensureColumn(
  tableName: string,
  columnName: string,
  definitionSql: string,
) {
  const existingColumns = await getExistingColumns(tableName);
  if (existingColumns.has(columnName)) return;

  try {
    await pool.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN ${definitionSql}`,
    );
    logger.info({ tableName, columnName }, "Added missing legacy column");
  } catch (error) {
    const code = (error as { code?: string } | undefined)?.code;
    if (code === "ER_DUP_FIELDNAME") {
      logger.info(
        { tableName, columnName },
        "Legacy column already existed during compatibility check",
      );
      return;
    }
    throw error;
  }
}

export async function ensureLegacySchemaCompatibility(): Promise<void> {
  await ensureColumn(
    "users",
    "is_active",
    "`is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `role`",
  );
  await ensureColumn(
    "employees",
    "wife_name",
    "`wife_name` TEXT NULL AFTER `marital_status`",
  );
  await ensureColumn(
    "employees",
    "wife_date_of_birth",
    "`wife_date_of_birth` TEXT NULL AFTER `wife_name`",
  );
  await ensureColumn(
    "employees",
    "kids_count",
    "`kids_count` TEXT NULL AFTER `wife_date_of_birth`",
  );
  await ensureColumn(
    "employees",
    "kids_names",
    "`kids_names` TEXT NULL AFTER `kids_count`",
  );
}
