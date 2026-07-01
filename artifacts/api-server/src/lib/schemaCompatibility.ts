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
    "primary_bank_branch_location",
    "`primary_bank_branch_location` VARCHAR(255) NULL AFTER `primary_bank_branch_code`",
  );
  await ensureColumn(
    "employees",
    "secondary_bank_branch_location",
    "`secondary_bank_branch_location` VARCHAR(255) NULL AFTER `secondary_bank_branch_code`",
  );
  await ensureColumn(
    "employees",
    "break_minutes",
    "`break_minutes` INT NOT NULL DEFAULT 60 AFTER `grace_period_minutes`",
  );
  await ensureColumn(
    "attendance",
    "work_mode",
    "`work_mode` ENUM('onsite','remote_work') NULL AFTER `status`",
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
  await ensureColumn(
    "general_requests",
    "date_to",
    "`date_to` DATE NULL AFTER `date`",
  );
  await ensureColumn(
    "general_requests",
    "attachment_url",
    "`attachment_url` VARCHAR(1024) NULL AFTER `reason`",
  );
  await ensureColumn(
    "general_requests",
    "attachment_name",
    "`attachment_name` VARCHAR(255) NULL AFTER `attachment_url`",
  );
  await ensureColumn(
    "general_requests",
    "attachments",
    "`attachments` JSON NOT NULL DEFAULT ('[]') AFTER `attachment_name`",
  );
  await ensureColumn(
    "general_requests",
    "mentioned_employee_ids",
    "`mentioned_employee_ids` JSON NOT NULL DEFAULT ('[]') AFTER `attachments`",
  );
  await ensureColumn(
    "general_requests",
    "installment_months",
    "`installment_months` INT NULL AFTER `status`",
  );
  await ensureColumn(
    "leave_requests",
    "attachments",
    "`attachments` JSON NOT NULL DEFAULT ('[]') AFTER `attachment_name`",
  );
  await ensureColumn(
    "payslips",
    "scheduled_minutes",
    "`scheduled_minutes` INT NOT NULL DEFAULT 0 AFTER `late_absence_days`",
  );
  await ensureColumn(
    "payslips",
    "completed_minutes",
    "`completed_minutes` INT NOT NULL DEFAULT 0 AFTER `scheduled_minutes`",
  );
  await ensureColumn(
    "payslips",
    "extra_minutes",
    "`extra_minutes` INT NOT NULL DEFAULT 0 AFTER `completed_minutes`",
  );
  await ensureColumn(
    "payslips",
    "short_minutes",
    "`short_minutes` INT NOT NULL DEFAULT 0 AFTER `extra_minutes`",
  );
  await ensureColumn(
    "leave_requests",
    "mentioned_employee_ids",
    "`mentioned_employee_ids` JSON NOT NULL DEFAULT ('[]') AFTER `attachments`",
  );
  await ensureColumn(
    "remote_work_requests",
    "attachments",
    "`attachments` JSON NOT NULL DEFAULT ('[]') AFTER `attachment_name`",
  );
  await ensureColumn(
    "remote_work_requests",
    "mentioned_employee_ids",
    "`mentioned_employee_ids` JSON NOT NULL DEFAULT ('[]') AFTER `attachments`",
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

  await ensureTable(
    "attendance_extension_links",
    `CREATE TABLE IF NOT EXISTS \`attendance_extension_links\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`employee_id\` INT NOT NULL,
      \`status\` ENUM('pending','connected','revoked') NOT NULL DEFAULT 'pending',
      \`connection_code\` VARCHAR(32) NULL,
      \`code_expires_at\` TIMESTAMP NULL,
      \`access_token_hash\` VARCHAR(128) NULL,
      \`device_name\` VARCHAR(255) NULL,
      \`last_state\` ENUM('active','idle','locked','offline') NULL,
      \`last_heartbeat_at\` TIMESTAMP NULL,
      \`last_active_at\` TIMESTAMP NULL,
      \`last_idle_started_at\` TIMESTAMP NULL,
      \`browser_alive\` TINYINT(1) NULL,
      \`network_online\` TINYINT(1) NULL,
      \`extension_version\` VARCHAR(32) NULL,
      \`disconnected_at\` TIMESTAMP NULL,
      \`last_warning_at\` TIMESTAMP NULL,
      \`auto_paused_at\` TIMESTAMP NULL,
      \`connected_at\` TIMESTAMP NULL,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`attendance_extension_links_employee_unique\` (\`employee_id\`),
      UNIQUE KEY \`attendance_extension_links_code_unique\` (\`connection_code\`),
      UNIQUE KEY \`attendance_extension_links_token_unique\` (\`access_token_hash\`),
      CONSTRAINT \`attendance_extension_links_employee_id_employees_id_fk\`
        FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE
    )`,
  );

  await ensureColumn(
    "attendance_extension_links",
    "browser_alive",
    "`browser_alive` TINYINT(1) NULL AFTER `last_idle_started_at`",
  );
  await ensureColumn(
    "attendance_extension_links",
    "network_online",
    "`network_online` TINYINT(1) NULL AFTER `browser_alive`",
  );
  await ensureColumn(
    "attendance_extension_links",
    "extension_version",
    "`extension_version` VARCHAR(32) NULL AFTER `network_online`",
  );
  await ensureColumn(
    "attendance_extension_links",
    "disconnected_at",
    "`disconnected_at` TIMESTAMP NULL AFTER `extension_version`",
  );
}
