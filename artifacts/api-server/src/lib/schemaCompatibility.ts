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

async function ensureTable(
  tableName: string,
  createSql: string,
) {
  try {
    await pool.query(createSql);
    logger.info({ tableName }, "Ensured compatibility table");
  } catch (error) {
    logger.error({ err: error, tableName }, "Could not ensure compatibility table");
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
  await ensureColumn(
    "employees",
    "medical_enabled",
    "`medical_enabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `secondary_bank_branch_code`",
  );
  await ensureColumn(
    "employees",
    "medical_daily_limit",
    "`medical_daily_limit` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `medical_enabled`",
  );
  await ensureColumn(
    "employees",
    "medical_overall_limit",
    "`medical_overall_limit` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `medical_daily_limit`",
  );
  await ensureColumn(
    "employees",
    "medical_opd_limit",
    "`medical_opd_limit` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `medical_overall_limit`",
  );
  await ensureColumn(
    "employees",
    "medical_ipd_limit",
    "`medical_ipd_limit` DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER `medical_opd_limit`",
  );

  await ensureTable(
    "medical_claims",
    `CREATE TABLE IF NOT EXISTS \`medical_claims\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`employee_id\` INT NOT NULL,
      \`created_by_user_id\` INT NOT NULL,
      \`dependent_relation\` ENUM('self','spouse','child') NOT NULL DEFAULT 'self',
      \`dependent_name\` VARCHAR(255) NULL,
      \`treatment_type\` ENUM('opd','ipd') NOT NULL DEFAULT 'opd',
      \`claim_date\` DATE NOT NULL,
      \`hospital_name\` VARCHAR(255) NULL,
      \`doctor_name\` VARCHAR(255) NULL,
      \`amount\` DECIMAL(12,2) NOT NULL,
      \`approved_amount\` DECIMAL(12,2) NULL,
      \`notes\` TEXT NULL,
      \`review_note\` TEXT NULL,
      \`attachment_url\` VARCHAR(1024) NULL,
      \`attachment_name\` VARCHAR(255) NULL,
      \`status\` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      \`reviewed_by_user_id\` INT NULL,
      \`reviewed_at\` TIMESTAMP NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`medical_claims_employee_id_idx\` (\`employee_id\`),
      KEY \`medical_claims_created_by_user_id_idx\` (\`created_by_user_id\`),
      KEY \`medical_claims_reviewed_by_user_id_idx\` (\`reviewed_by_user_id\`),
      CONSTRAINT \`medical_claims_employee_id_employees_id_fk\`
        FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`medical_claims_created_by_user_id_users_id_fk\`
        FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`medical_claims_reviewed_by_user_id_users_id_fk\`
        FOREIGN KEY (\`reviewed_by_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL
    )`,
  );

  await ensureTable(
    "notifications",
    `CREATE TABLE IF NOT EXISTS \`notifications\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`type\` VARCHAR(64) NOT NULL DEFAULT 'system',
      \`title\` VARCHAR(255) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`href\` VARCHAR(1024) NULL,
      \`is_read\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      KEY \`notifications_user_id_idx\` (\`user_id\`),
      CONSTRAINT \`notifications_user_id_users_id_fk\`
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    )`,
  );
}
