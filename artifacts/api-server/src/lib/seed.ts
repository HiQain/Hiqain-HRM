import {
  db,
  employeesTable,
  usersTable,
} from "@workspace/db";
import { hashPassword, getUserByEmail } from "./auth";
import { logger } from "./logger";
import {
  getBootstrapAdminConfig,
  getSampleEmployees,
  shouldSeedSampleData,
} from "./runtimeConfig";

export async function ensureSeed(): Promise<void> {
  const adminConfig = getBootstrapAdminConfig();

  // Admin
  if (!adminConfig) {
    logger.warn(
      "Skipping bootstrap admin seed because HRM_BOOTSTRAP_ADMIN_EMAIL/PASSWORD are not configured",
    );
  } else {
  const existingAdmin = await getUserByEmail(adminConfig.email);

  if (!existingAdmin) {
    const hash = await hashPassword(adminConfig.password);
    await db.insert(usersTable).values({
      email: adminConfig.email,
      passwordHash: hash,
      role: "admin",
      mustChangePassword: false,
    });
    logger.info({ email: adminConfig.email }, "Seeded bootstrap admin user");
  }
  }

  if (!shouldSeedSampleData) {
    return;
  }

  // Sample employees
  const empCount = await db.select().from(employeesTable).limit(1);
  if (empCount.length) return;

  const samples = getSampleEmployees();
  if (samples.length === 0) return;

  for (const s of samples) {
    const hash = await hashPassword(s.password);
    const insertedUser = await db
      .insert(usersTable)
      .values({
        email: s.email,
        passwordHash: hash,
        role: "employee",
        mustChangePassword: true,
      })
      .$returningId();
    const userId = insertedUser[0]?.id;
    if (!userId) continue;

    const insertedEmployee = await db
      .insert(employeesTable)
      .values({
        userId,
        name: s.name,
        phone: s.phone,
        position: s.position,
        department: s.department,
        positionType: s.positionType,
        joiningDate: s.joiningDate,
        probationMonths: s.probationMonths,
        officeStartTime: s.officeStartTime,
        officeEndTime: s.officeEndTime,
        gracePeriodMinutes: s.gracePeriodMinutes,
        basicSalary: String(s.basicSalary),
        allowances: String(s.allowances),
        casualLeaveQuota: s.casualLeaveQuota,
        sickLeaveQuota: s.sickLeaveQuota,
        annualLeaveQuota: s.annualLeaveQuota,
        dateOfBirth: s.dateOfBirth,
        education: s.education,
        address: s.address,
      })
      .$returningId();
    const employeeId = insertedEmployee[0]?.id;
    if (!employeeId) continue;
  }
  logger.info({ count: samples.length }, "Seeded sample employees from runtime config");
}
