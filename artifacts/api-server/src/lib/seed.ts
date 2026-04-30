import {
  attendanceTable,
  db,
  employeesTable,
  leaveRequestsTable,
  salaryEventsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import { logger } from "./logger";
import { ymd } from "./dates";

const ADMIN_EMAIL = "admin@hiqain.com";
const ADMIN_PASSWORD = "password";
const shouldSeedSampleData = process.env["HRM_SEED_SAMPLE_DATA"] === "true";

export async function ensureSeed(): Promise<void> {
  // Admin
  const existingAdmin = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, ADMIN_EMAIL))
    .limit(1);

  if (!existingAdmin.length) {
    const hash = await hashPassword(ADMIN_PASSWORD);
    await db.insert(usersTable).values({
      email: ADMIN_EMAIL,
      passwordHash: hash,
      role: "admin",
      mustChangePassword: false,
    });
    logger.info({ email: ADMIN_EMAIL }, "Seeded admin user");
  }

  if (!shouldSeedSampleData) {
    return;
  }

  // Sample employees
  const empCount = await db.select().from(employeesTable).limit(1);
  if (empCount.length) return;

  const samples = [
    {
      email: "ayesha@hiqain.com",
      password: "welcome123",
      name: "Ayesha Khan",
      phone: "+92 300 1234567",
      position: "Senior Product Designer",
      department: "Design",
      positionType: "onsite" as const,
      joiningDate: "2022-03-15",
      probationMonths: 3,
      officeStartTime: "09:30",
      officeEndTime: "18:30",
      gracePeriodMinutes: 15,
      basicSalary: 180000,
      allowances: 25000,
      casualLeaveQuota: 10,
      sickLeaveQuota: 10,
      annualLeaveQuota: 14,
      dateOfBirth: "1993-07-22",
      education: "BFA, National College of Arts",
      address: "Lahore, Pakistan",
    },
    {
      email: "bilal@hiqain.com",
      password: "welcome123",
      name: "Bilal Ahmed",
      phone: "+92 333 2223344",
      position: "Lead Frontend Engineer",
      department: "Engineering",
      positionType: "remote" as const,
      joiningDate: "2021-09-01",
      probationMonths: 3,
      officeStartTime: "10:00",
      officeEndTime: "19:00",
      gracePeriodMinutes: 10,
      basicSalary: 240000,
      allowances: 30000,
      casualLeaveQuota: 12,
      sickLeaveQuota: 10,
      annualLeaveQuota: 18,
      dateOfBirth: "1991-11-04",
      education: "BSc Computer Science, FAST NUCES",
      address: "Karachi, Pakistan",
    },
    {
      email: "hira@hiqain.com",
      password: "welcome123",
      name: "Hira Saleem",
      phone: "+92 321 9988776",
      position: "HR Coordinator",
      department: "People Ops",
      positionType: "onsite" as const,
      joiningDate: "2024-01-10",
      probationMonths: 6,
      officeStartTime: "09:00",
      officeEndTime: "18:00",
      gracePeriodMinutes: 15,
      basicSalary: 110000,
      allowances: 15000,
      casualLeaveQuota: 10,
      sickLeaveQuota: 10,
      annualLeaveQuota: 14,
      dateOfBirth: "1996-05-18",
      education: "MBA, IBA Karachi",
      address: "Islamabad, Pakistan",
    },
    {
      email: "omar@hiqain.com",
      password: "welcome123",
      name: "Omar Siddiqui",
      phone: "+92 345 1112233",
      position: "Backend Engineer",
      department: "Engineering",
      positionType: "onsite" as const,
      joiningDate: "2025-08-04",
      probationMonths: 3,
      officeStartTime: "10:00",
      officeEndTime: "19:00",
      gracePeriodMinutes: 15,
      basicSalary: 165000,
      allowances: 18000,
      casualLeaveQuota: 8,
      sickLeaveQuota: 8,
      annualLeaveQuota: 12,
      dateOfBirth: "1998-02-09",
      education: "BS Software Engineering, NUST",
      address: "Rawalpindi, Pakistan",
    },
  ];

  const createdIds: number[] = [];
  for (const s of samples) {
    const hash = await hashPassword(s.password);
    const u = await db
      .insert(usersTable)
      .values({
        email: s.email,
        passwordHash: hash,
        role: "employee",
        mustChangePassword: true,
      })
      .returning();
    const e = await db
      .insert(employeesTable)
      .values({
        userId: u[0]!.id,
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
      .returning();
    createdIds.push(e[0]!.id);
  }

  // Salary events
  await db.insert(salaryEventsTable).values([
    {
      employeeId: createdIds[0]!,
      type: "increment",
      amount: "20000",
      date: "2024-01-15",
      reason: "Annual increment",
    },
    {
      employeeId: createdIds[0]!,
      type: "bonus",
      amount: "50000",
      date: "2025-12-20",
      reason: "Year-end bonus",
    },
    {
      employeeId: createdIds[1]!,
      type: "increment",
      amount: "30000",
      date: "2024-09-01",
      reason: "Promotion to Lead",
    },
    {
      employeeId: createdIds[1]!,
      type: "loan",
      amount: "150000",
      date: "2025-06-10",
      reason: "Personal loan",
    },
    {
      employeeId: createdIds[2]!,
      type: "bonus",
      amount: "20000",
      date: "2025-07-01",
      reason: "Onboarding bonus",
    },
  ]);

  // Recent leave requests
  const today = new Date();
  const inDays = (n: number) => {
    const d = new Date(today.getTime() + n * 24 * 60 * 60 * 1000);
    return ymd(d);
  };
  await db.insert(leaveRequestsTable).values([
    {
      employeeId: createdIds[2]!,
      type: "casual",
      startDate: inDays(3),
      endDate: inDays(4),
      days: 2,
      reason: "Family event",
      status: "pending",
    },
    {
      employeeId: createdIds[3]!,
      type: "sick",
      startDate: inDays(-7),
      endDate: inDays(-7),
      days: 1,
      reason: "Flu",
      status: "approved",
      reviewedAt: new Date(today.getTime() - 7 * 86400000),
    },
    {
      employeeId: createdIds[0]!,
      type: "annual",
      startDate: inDays(14),
      endDate: inDays(18),
      days: 5,
      reason: "Vacation",
      status: "pending",
    },
  ]);

  // A few attendance records for today and yesterday
  const todayStr = ymd(today);
  const yesterdayStr = inDays(-1);
  const checkIn = (offsetMin: number) => {
    const d = new Date();
    d.setUTCHours(4, 0, 0, 0); // ~09:00 PKT
    return new Date(d.getTime() + offsetMin * 60_000);
  };
  await db.insert(attendanceTable).values([
    {
      employeeId: createdIds[0]!,
      date: todayStr,
      checkInTime: checkIn(20),
      status: "present",
      isLate: false,
    },
    {
      employeeId: createdIds[1]!,
      date: todayStr,
      checkInTime: checkIn(50),
      status: "late",
      isLate: true,
    },
    {
      employeeId: createdIds[0]!,
      date: yesterdayStr,
      checkInTime: new Date(Date.now() - 86400000 + 8 * 3600000),
      checkOutTime: new Date(Date.now() - 86400000 + 17 * 3600000),
      workedMinutes: 540,
      status: "present",
      isLate: false,
    },
    {
      employeeId: createdIds[1]!,
      date: yesterdayStr,
      checkInTime: new Date(Date.now() - 86400000 + 9 * 3600000),
      checkOutTime: new Date(Date.now() - 86400000 + 18 * 3600000),
      workedMinutes: 540,
      status: "late",
      isLate: true,
    },
    {
      employeeId: createdIds[2]!,
      date: yesterdayStr,
      checkInTime: new Date(Date.now() - 86400000 + 8.2 * 3600000),
      checkOutTime: new Date(Date.now() - 86400000 + 17.5 * 3600000),
      workedMinutes: 558,
      status: "present",
      isLate: false,
    },
  ]);

  logger.info("Seeded sample HRM data");
}
