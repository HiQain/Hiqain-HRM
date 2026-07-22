import { Router, type IRouter } from "express";
import {
  CreateEmployeeBody,
  UpdateEmployeeBody,
  CreateSalaryEventBody,
  UpdateSalaryEventBody,
} from "@workspace/api-zod";
import {
  db,
  employeesTable,
  usersTable,
  salaryEventsTable,
  designationChangesTable,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { getUser, hashPassword, requireAuth } from "../lib/auth";
import { addMonths, diffMonths, parseDate, ymd } from "../lib/dates";
import { notifyEmployeeUser } from "../lib/notifications";
import {
  applyPermanentIncrementToCompensation,
  inferPercentageBaseAmount,
  splitCompensationBySettings,
} from "../lib/salary";
import { getSettings } from "./settings";

const router: IRouter = Router();
const PRIMARY_PAYROLL_BANK_NAME = "Bank Al Habib";

function parseTimeToMinutes(value: string | null | undefined): number {
  if (!value) return 0;
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function computeShiftSpanMinutes(
  officeStartTime: string | null | undefined,
  officeEndTime: string | null | undefined,
) {
  const start = parseTimeToMinutes(officeStartTime);
  const end = parseTimeToMinutes(officeEndTime);
  return end <= start ? 24 * 60 - start + end : end - start;
}

function inferBreakMinutes(
  officeStartTime: string | null | undefined,
  officeEndTime: string | null | undefined,
) {
  return computeShiftSpanMinutes(officeStartTime, officeEndTime) <= 6 * 60
    ? 30
    : 60;
}

function buildEmployeeCode(sequence: number): string {
  return `EMP-${String(sequence).padStart(3, "0")}`;
}

function parseEmployeeCodeSequence(code: string | null | undefined): number {
  if (!code) return 0;
  const match = /^EMP-(\d+)$/i.exec(code.trim());
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getNextEmployeeCode(): Promise<string> {
  const rows = await db
    .select({ employeeCode: employeesTable.employeeCode })
    .from(employeesTable);
  const maxSequence = rows.reduce(
    (max, row) => Math.max(max, parseEmployeeCodeSequence(row.employeeCode)),
    0,
  );
  return buildEmployeeCode(Math.max(maxSequence, rows.length) + 1);
}

function subtractDay(d: Date): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() - 1);
  return r;
}

function parseKidsNames(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function serializeKidsNames(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const names = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return names.length ? JSON.stringify(names) : null;
}

function serializeEmployee(
  e: typeof employeesTable.$inferSelect,
  email: string,
  isActive: boolean,
  role: "admin" | "hr" | "employee" = "employee",
) {
  const joining = parseDate(e.joiningDate);
  const probationEnd = subtractDay(addMonths(joining, e.probationMonths));
  const primaryBankAccountTitle =
    e.primaryBankAccountTitle ?? e.bankAccountTitle ?? null;
  const primaryBankAccountNumber =
    e.primaryBankAccountNumber ?? e.bankAccountNumber ?? null;
  const primaryBankName =
    e.primaryBankName ?? e.bankName ?? PRIMARY_PAYROLL_BANK_NAME;
  const primaryBankIban = e.primaryBankIban ?? e.bankIban ?? null;
  const primaryBankBranchCode =
    e.primaryBankBranchCode ?? e.bankBranchCode ?? null;
  const primaryBankBranchLocation = e.primaryBankBranchLocation ?? null;
  return {
    id: e.id,
    userId: e.userId,
    name: e.name,
    email,
    role,
    isActive,
    personalEmail: e.personalEmail,
    phone: e.phone,
    position: e.position,
    department: e.department,
    positionType: e.positionType,
    joiningDate: e.joiningDate,
    probationMonths: e.probationMonths,
    probationEndDate: ymd(probationEnd),
    officeStartTime: e.officeStartTime,
    officeEndTime: e.officeEndTime,
    gracePeriodMinutes: e.gracePeriodMinutes,
    breakMinutes: e.breakMinutes,
    basicSalary: Number(e.basicSalary),
    allowances: Number(e.allowances),
    casualLeaveQuota: e.casualLeaveQuota,
    sickLeaveQuota: e.sickLeaveQuota,
    annualLeaveQuota: e.annualLeaveQuota,
    dateOfBirth: e.dateOfBirth,
    education: e.education,
    address: e.address,
    avatarUrl: e.avatarUrl,
    // New fields
    employeeCode: e.employeeCode,
    maritalStatus: e.maritalStatus,
    wifeName: e.wifeName,
    wifeDateOfBirth: e.wifeDateOfBirth,
    kidsCount: e.kidsCount != null ? Number(e.kidsCount) : null,
    kidsNames: parseKidsNames(e.kidsNames),
    leftDate: e.leftDate,
    emergencyContactName: e.emergencyContactName,
    emergencyContactNumber: e.emergencyContactNumber,
    emergencyContactRelation: e.emergencyContactRelation,
    emergencyContact: e.emergencyContact,
    cnic: e.cnic,
    lastQualification: e.lastQualification,
    previousCompany: e.previousCompany,
    lastPay: e.lastPay != null ? Number(e.lastPay) : null,
    benefits: e.benefits,
    notes: e.notes,
    immediateFamily: e.immediateFamily,
    employmentContractUrl: e.employmentContractUrl,
    employmentContractName: e.employmentContractName,
    cnicDocumentUrl: e.cnicDocumentUrl,
    cnicDocumentName: e.cnicDocumentName,
    cnicFrontDocumentUrl: e.cnicFrontDocumentUrl,
    cnicFrontDocumentName: e.cnicFrontDocumentName,
    cnicBackDocumentUrl: e.cnicBackDocumentUrl,
    cnicBackDocumentName: e.cnicBackDocumentName,
    qualificationDocumentUrl: e.qualificationDocumentUrl,
    qualificationDocumentName: e.qualificationDocumentName,
    lastPayslipOneUrl: e.lastPayslipOneUrl,
    lastPayslipOneName: e.lastPayslipOneName,
    lastPayslipTwoUrl: e.lastPayslipTwoUrl,
    lastPayslipTwoName: e.lastPayslipTwoName,
    lastPayslipThreeUrl: e.lastPayslipThreeUrl,
    lastPayslipThreeName: e.lastPayslipThreeName,
    bankAccountTitle: primaryBankAccountTitle,
    bankAccountNumber: primaryBankAccountNumber,
    bankName: primaryBankName,
    bankIban: primaryBankIban,
    bankBranchCode: primaryBankBranchCode,
    primaryBankAccountTitle,
    primaryBankAccountNumber,
    primaryBankName,
    primaryBankIban,
    primaryBankBranchCode,
    primaryBankBranchLocation,
    secondaryBankAccountTitle: e.secondaryBankAccountTitle,
    secondaryBankAccountNumber: e.secondaryBankAccountNumber,
    secondaryBankName: e.secondaryBankName,
    secondaryBankIban: e.secondaryBankIban,
    secondaryBankBranchCode: e.secondaryBankBranchCode,
    secondaryBankBranchLocation: e.secondaryBankBranchLocation,
    medicalEnabled: Boolean(e.medicalEnabled),
    medicalDailyLimit: Number(e.medicalDailyLimit ?? 0),
    medicalOverallLimit: Number(e.medicalOverallLimit ?? 0),
    medicalOpdLimit: 0,
    medicalIpdLimit: Number(e.medicalOverallLimit ?? 0),
    providentFundPercent:
      e.providentFundPercent != null ? Number(e.providentFundPercent) : null,
  };
}

function getEmployeeBankValues(data: Record<string, unknown>) {
  const primaryBankAccountTitle =
    (data.primaryBankAccountTitle as string | null | undefined) ??
    (data.bankAccountTitle as string | null | undefined) ??
    null;
  const primaryBankAccountNumber =
    (data.primaryBankAccountNumber as string | null | undefined) ??
    (data.bankAccountNumber as string | null | undefined) ??
    null;
  const primaryBankIban =
    (data.primaryBankIban as string | null | undefined) ??
    (data.bankIban as string | null | undefined) ??
    null;
  const primaryBankBranchCode =
    (data.primaryBankBranchCode as string | null | undefined) ??
    (data.bankBranchCode as string | null | undefined) ??
    null;
  const primaryBankBranchLocation =
    (data.primaryBankBranchLocation as string | null | undefined) ?? null;
  const secondaryBankAccountTitle =
    (data.secondaryBankAccountTitle as string | null | undefined) ?? null;
  const secondaryBankAccountNumber =
    (data.secondaryBankAccountNumber as string | null | undefined) ?? null;
  const secondaryBankName =
    (data.secondaryBankName as string | null | undefined) ?? null;
  const secondaryBankIban =
    (data.secondaryBankIban as string | null | undefined) ?? null;
  const secondaryBankBranchCode =
    (data.secondaryBankBranchCode as string | null | undefined) ?? null;
  const secondaryBankBranchLocation =
    (data.secondaryBankBranchLocation as string | null | undefined) ?? null;

  return {
    bankAccountTitle: primaryBankAccountTitle,
    bankAccountNumber: primaryBankAccountNumber,
    bankName: PRIMARY_PAYROLL_BANK_NAME,
    bankIban: primaryBankIban,
    bankBranchCode: primaryBankBranchCode,
    primaryBankAccountTitle,
    primaryBankAccountNumber,
    primaryBankName: PRIMARY_PAYROLL_BANK_NAME,
    primaryBankIban,
    primaryBankBranchCode,
    primaryBankBranchLocation,
    secondaryBankAccountTitle,
    secondaryBankAccountNumber,
    secondaryBankName,
    secondaryBankIban,
    secondaryBankBranchCode,
    secondaryBankBranchLocation,
  };
}

function buildBulkEmployeeValues(
  data: typeof CreateEmployeeBody._type,
  settings: Awaited<ReturnType<typeof getSettings>>,
  employeeCode: string,
) {
  const importedBasicSalary = Number(data.basicSalary ?? 0);
  const importedAllowances = Number(data.allowances ?? 0);
  const resolvedCompensation =
    importedAllowances > 0
      ? {
          basicSalary: importedBasicSalary,
          allowances: importedAllowances,
        }
      : splitCompensationBySettings(importedBasicSalary, settings);
  const bankValues = getEmployeeBankValues(data as Record<string, unknown>);
  const joiningDateStr = data.joiningDate as unknown as string;
  const probationMonths =
    data.probationMonths ?? settings.defaultProbationMonths;
  const officeStartTime =
    normalizeOfficeTime(data.officeStartTime) ?? settings.defaultOfficeStartTime;
  const officeEndTime =
    normalizeOfficeTime(data.officeEndTime) ?? settings.defaultOfficeEndTime;
  const breakMinutes =
    (data as any).breakMinutes ?? inferBreakMinutes(officeStartTime, officeEndTime);
  const hasUploadedCasualLeaveQuota = data.casualLeaveQuota !== undefined;
  const hasUploadedSickLeaveQuota = data.sickLeaveQuota !== undefined;
  const hasUploadedAnnualLeaveQuota = data.annualLeaveQuota !== undefined;
  const baseCasual =
    data.casualLeaveQuota ?? settings.defaultCasualLeaveQuota;
  const baseSick = data.sickLeaveQuota ?? settings.defaultSickLeaveQuota;
  const baseAnnual =
    data.annualLeaveQuota ?? settings.defaultAnnualLeaveQuota;

  return {
    name: data.name,
    personalEmail: (data as any).personalEmail ?? null,
    phone: data.phone ?? null,
    position: data.position ?? null,
    department: data.department ?? null,
    positionType: data.positionType ?? "onsite",
    joiningDate: joiningDateStr,
    probationMonths,
    officeStartTime,
    officeEndTime,
    gracePeriodMinutes:
      data.gracePeriodMinutes ?? settings.defaultGracePeriodMinutes,
    breakMinutes,
    basicSalary: String(resolvedCompensation.basicSalary),
    allowances: String(resolvedCompensation.allowances),
    providentFundPercent:
      Number(settings.defaultProvidentFundPercent) > 0
        ? String(Number(settings.defaultProvidentFundPercent))
        : null,
    casualLeaveQuota: settings.proRatedQuotas && !hasUploadedCasualLeaveQuota
      ? proRatedQuota(baseCasual, joiningDateStr, probationMonths)
      : baseCasual,
    sickLeaveQuota: settings.proRatedQuotas && !hasUploadedSickLeaveQuota
      ? proRatedQuota(baseSick, joiningDateStr, probationMonths)
      : baseSick,
    annualLeaveQuota: settings.proRatedQuotas && !hasUploadedAnnualLeaveQuota
      ? proRatedQuota(baseAnnual, joiningDateStr, probationMonths)
      : baseAnnual,
    dateOfBirth: (data.dateOfBirth as unknown as string) ?? null,
    education: data.education ?? null,
    address: data.address ?? null,
    employeeCode,
    maritalStatus: (data as any).maritalStatus ?? null,
    wifeName: (data as any).wifeName ?? null,
    wifeDateOfBirth:
      ((data as any).wifeDateOfBirth as unknown as string) ?? null,
    kidsCount:
      (data as any).kidsCount != null ? String((data as any).kidsCount) : null,
    kidsNames: serializeKidsNames((data as any).kidsNames),
    emergencyContactName: (data as any).emergencyContactName ?? null,
    emergencyContactNumber: (data as any).emergencyContactNumber ?? null,
    emergencyContactRelation:
      (data as any).emergencyContactRelation ?? null,
    emergencyContact: (data as any).emergencyContact ?? null,
    cnic: (data as any).cnic ?? null,
    lastQualification: (data as any).lastQualification ?? null,
    previousCompany: (data as any).previousCompany ?? null,
    lastPay:
      (data as any).lastPay != null ? String((data as any).lastPay) : null,
    benefits: (data as any).benefits ?? null,
    notes: (data as any).notes ?? null,
    immediateFamily: (data as any).immediateFamily ?? null,
    ...bankValues,
  };
}

router.get("/employees", requireAuth(["admin", "hr"]), async (_req, res) => {
  const rows = await db
    .select({
      employee: employeesTable,
      email: usersTable.email,
      isActive: usersTable.isActive,
      role: usersTable.role,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .orderBy(desc(employeesTable.createdAt));
  res.json(
    rows.map(({ employee, email, isActive, role }) =>
      serializeEmployee(employee, email, Boolean(isActive), role),
    ),
  );
});

function proRatedQuota(
  quota: number,
  joiningDate: string,
  probationMonths: number,
): number {
  const effectiveDate = addMonths(parseDate(joiningDate), probationMonths);
  const today = new Date();
  if (effectiveDate.getUTCFullYear() !== today.getUTCFullYear()) {
    return quota;
  }
  const effectiveMonthIndex =
    effectiveDate.getUTCDate() >= 16
      ? effectiveDate.getUTCMonth() + 1
      : effectiveDate.getUTCMonth();
  const monthsRemaining = Math.max(0, 12 - effectiveMonthIndex);
  return Math.max(0, Math.round((quota * monthsRemaining) / 12));
}

function normalizeOfficeTime(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  const meridiemMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (!meridiemMatch) return undefined;

  const parsedHours = Number(meridiemMatch[1]);
  const parsedMinutes = Number(meridiemMatch[2]);
  if (parsedHours < 1 || parsedHours > 12 || parsedMinutes < 0 || parsedMinutes > 59) {
    return undefined;
  }

  const meridiem = meridiemMatch[3].toUpperCase();
  const normalizedHours =
    meridiem === "AM"
      ? parsedHours % 12
      : (parsedHours % 12) + 12;

  return `${String(normalizedHours).padStart(2, "0")}:${String(parsedMinutes).padStart(2, "0")}`;
}

router.post("/employees", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid employee payload" });
    return;
  }
  const data = parsed.data;
  const actor = getUser(req);
  const email = data.email.toLowerCase();
  const settings = await getSettings();
  const bankValues = getEmployeeBankValues(data as Record<string, unknown>);

  // Only admins can create another admin (HR cannot escalate privileges).
  if (data.role === "admin" && actor.role !== "admin") {
    res
      .status(403)
      .json({ message: "Only admins can create another admin." });
    return;
  }
  const resolvedRole: "admin" | "hr" | "employee" =
    data.role === "admin" ? "admin" : data.role === "hr" ? "hr" : "employee";

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length) {
    res.status(400).json({ message: "Email already exists" });
    return;
  }

  const passwordHash = await hashPassword(data.password);
  const insertedUser = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      role: resolvedRole,
      isActive: (data as any).isActive ?? true,
      mustChangePassword: true,
    })
    .$returningId();
  const userId = insertedUser[0]?.id;
  if (!userId) {
    res.status(500).json({ message: "Failed to create user" });
    return;
  }

  // Auto-generate employee code if not provided
  const autoCode = await getNextEmployeeCode();

  const joiningDateStr = data.joiningDate as unknown as string;
  const probationMonths =
    data.probationMonths ?? settings.defaultProbationMonths;
  const officeStartTime =
    normalizeOfficeTime(data.officeStartTime) ?? settings.defaultOfficeStartTime;
  const officeEndTime =
    normalizeOfficeTime(data.officeEndTime) ?? settings.defaultOfficeEndTime;
  const breakMinutes =
    data.breakMinutes ?? inferBreakMinutes(officeStartTime, officeEndTime);
  const hasManualCasualLeaveQuota = data.casualLeaveQuota !== undefined;
  const hasManualSickLeaveQuota = data.sickLeaveQuota !== undefined;
  const hasManualAnnualLeaveQuota = data.annualLeaveQuota !== undefined;
  const baseCasual = data.casualLeaveQuota ?? settings.defaultCasualLeaveQuota;
  const baseSick = data.sickLeaveQuota ?? settings.defaultSickLeaveQuota;
  const baseAnnual = data.annualLeaveQuota ?? settings.defaultAnnualLeaveQuota;
  const casualLeaveQuota = settings.proRatedQuotas && !hasManualCasualLeaveQuota
    ? proRatedQuota(baseCasual, joiningDateStr, probationMonths)
    : baseCasual;
  const sickLeaveQuota = settings.proRatedQuotas && !hasManualSickLeaveQuota
    ? proRatedQuota(baseSick, joiningDateStr, probationMonths)
    : baseSick;
  const annualLeaveQuota = settings.proRatedQuotas && !hasManualAnnualLeaveQuota
    ? proRatedQuota(baseAnnual, joiningDateStr, probationMonths)
    : baseAnnual;

  const insertedEmp = await db
    .insert(employeesTable)
    .values({
      userId,
      name: data.name,
      personalEmail: (data as any).personalEmail ?? null,
      phone: data.phone ?? null,
      position: data.position ?? null,
      department: data.department ?? null,
      positionType: data.positionType ?? "onsite",
      joiningDate: joiningDateStr,
      probationMonths,
      officeStartTime,
      officeEndTime,
      gracePeriodMinutes:
        data.gracePeriodMinutes ?? settings.defaultGracePeriodMinutes,
      breakMinutes,
      basicSalary: String(data.basicSalary),
      allowances: String(data.allowances ?? 0),
      providentFundPercent:
        Number(settings.defaultProvidentFundPercent) > 0
          ? String(Number(settings.defaultProvidentFundPercent))
          : null,
      casualLeaveQuota,
      sickLeaveQuota,
      annualLeaveQuota,
      dateOfBirth: (data.dateOfBirth as unknown as string) ?? null,
      education: data.education ?? null,
      address: data.address ?? null,
      employeeCode: (data as any).employeeCode ?? autoCode,
      maritalStatus: (data as any).maritalStatus ?? null,
      wifeName: (data as any).wifeName ?? null,
      wifeDateOfBirth:
        ((data as any).wifeDateOfBirth as unknown as string) ?? null,
      kidsCount:
        (data as any).kidsCount != null ? String((data as any).kidsCount) : null,
      kidsNames: serializeKidsNames((data as any).kidsNames),
      emergencyContactName: (data as any).emergencyContactName ?? null,
      emergencyContactNumber: (data as any).emergencyContactNumber ?? null,
      emergencyContactRelation:
        (data as any).emergencyContactRelation ?? null,
      emergencyContact: (data as any).emergencyContact ?? null,
      cnic: (data as any).cnic ?? null,
      lastQualification: (data as any).lastQualification ?? null,
      previousCompany: (data as any).previousCompany ?? null,
      lastPay:
        (data as any).lastPay != null ? String((data as any).lastPay) : null,
      benefits: (data as any).benefits ?? null,
      notes: (data as any).notes ?? null,
      immediateFamily: (data as any).immediateFamily ?? null,
      cnicDocumentUrl: (data as any).cnicDocumentUrl ?? null,
      cnicDocumentName: (data as any).cnicDocumentName ?? null,
      cnicFrontDocumentUrl: (data as any).cnicFrontDocumentUrl ?? null,
      cnicFrontDocumentName: (data as any).cnicFrontDocumentName ?? null,
      cnicBackDocumentUrl: (data as any).cnicBackDocumentUrl ?? null,
      cnicBackDocumentName: (data as any).cnicBackDocumentName ?? null,
      qualificationDocumentUrl:
        (data as any).qualificationDocumentUrl ?? null,
      qualificationDocumentName:
        (data as any).qualificationDocumentName ?? null,
      lastPayslipOneUrl: (data as any).lastPayslipOneUrl ?? null,
      lastPayslipOneName: (data as any).lastPayslipOneName ?? null,
      lastPayslipTwoUrl: (data as any).lastPayslipTwoUrl ?? null,
      lastPayslipTwoName: (data as any).lastPayslipTwoName ?? null,
      lastPayslipThreeUrl: (data as any).lastPayslipThreeUrl ?? null,
      lastPayslipThreeName: (data as any).lastPayslipThreeName ?? null,
      medicalEnabled: Boolean(req.body?.medicalEnabled ?? false),
      medicalDailyLimit: String(Number(req.body?.medicalDailyLimit ?? 0) || 0),
      medicalOverallLimit: String(Number(req.body?.medicalOverallLimit ?? 0) || 0),
      medicalOpdLimit: "0",
      medicalIpdLimit: String(Number(req.body?.medicalOverallLimit ?? 0) || 0),
      ...bankValues,
    })
    .$returningId();
  const employeeId = insertedEmp[0]?.id;
  if (!employeeId) {
    res.status(500).json({ message: "Failed to create employee" });
    return;
  }
  const insertedRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  const employee = insertedRows[0];
  if (!employee) {
    res.status(500).json({ message: "Created employee could not be loaded" });
    return;
  }
  await notifyEmployeeUser(employeeId, {
    type: "account_created",
    title: "Welcome to HRM",
    message: "Your employee account has been created. Sign in to view your profile and daily tools.",
    href: "/employee",
  });
  res.status(201).json(
    serializeEmployee(
      employee,
      email,
      Boolean((data as any).isActive ?? true),
      resolvedRole,
    ),
  );
});

router.post("/employees/bulk", requireAuth(["admin", "hr"]), async (req, res): Promise<void> => {
  const members = req.body?.members;
  if (!Array.isArray(members) || members.length === 0) {
    res.status(400).json({ message: "members array required" });
    return;
  }
  const settings = await getSettings();
  const bulkActor = getUser(req);
  let created = 0;
  let failed = 0;
  const errors: Array<{ row: number; email: string | null; message: string }> = [];

  for (let i = 0; i < members.length; i++) {
    const raw = members[i] ?? {};
    const parsed = CreateEmployeeBody.safeParse(raw);
    if (!parsed.success) {
      failed += 1;
      errors.push({
        row: i + 1,
        email: typeof raw.email === "string" ? raw.email : null,
        message: parsed.error.issues[0]?.message ?? "Invalid row",
      });
      continue;
    }
    const data = parsed.data;
    const email = data.email.toLowerCase();
    try {
      const requestedRole: "admin" | "hr" | "employee" =
        data.role === "admin" ? "admin" : data.role === "hr" ? "hr" : "employee";
      // Only admins can create another admin during bulk import.
      const safeRole: "admin" | "hr" | "employee" =
        requestedRole === "admin" && bulkActor.role !== "admin"
          ? "employee"
          : requestedRole;
      const passwordHash = await hashPassword(data.password);
      await db.transaction(async (tx: any) => {
        const existingUsers = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        const existingUser = existingUsers[0];

        let userId = existingUser?.id;
        if (existingUser) {
          await tx
            .update(usersTable)
            .set({
              passwordHash,
              role: safeRole,
              isActive: (data as any).isActive ?? true,
              mustChangePassword: true,
            })
            .where(eq(usersTable.id, existingUser.id));
        } else {
          const insertedUser = await tx
            .insert(usersTable)
            .values({
              email,
              passwordHash,
              role: safeRole,
              isActive: (data as any).isActive ?? true,
              mustChangePassword: true,
            })
            .$returningId();
          userId = insertedUser[0]?.id;
        }

        if (!userId) {
          throw new Error("Failed to create user");
        }

        const existingEmployees = await tx
          .select()
          .from(employeesTable)
          .where(eq(employeesTable.userId, userId))
          .limit(1);
        const existingEmployee = existingEmployees[0];
        const employeeCode = existingEmployee?.employeeCode ?? (await getNextEmployeeCode());
        const employeeValues = buildBulkEmployeeValues(data, settings, employeeCode);

        if (existingEmployee) {
          await tx
            .update(employeesTable)
            .set(employeeValues)
            .where(eq(employeesTable.id, existingEmployee.id));
        } else {
          await tx.insert(employeesTable).values({
            userId,
            ...employeeValues,
          });
        }
      });
      created += 1;
    } catch (err) {
      failed += 1;
      errors.push({
        row: i + 1,
        email,
        message: err instanceof Error ? err.message : "Insert failed",
      });
    }
  }

  res.json({ created, failed, errors });
});

router.get("/users/mentionable", requireAuth(), async (_req, res) => {
  const rows = await db
    .select({
      id: employeesTable.id,
      name: employeesTable.name,
      email: usersTable.email,
      role: usersTable.role,
      position: employeesTable.position,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .orderBy(employeesTable.name);
  res.json(rows);
});

router.get("/employees/:id", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: "Invalid employee id" });
    return;
  }
  const user = getUser(req);
  if (user.role === "employee" && user.employeeId !== id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  const rows = await db
    .select({
      employee: employeesTable,
      email: usersTable.email,
      isActive: usersTable.isActive,
      role: usersTable.role,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }

  const events = await db
    .select()
    .from(salaryEventsTable)
    .where(eq(salaryEventsTable.employeeId, id))
    .orderBy(desc(salaryEventsTable.date));

  const base = serializeEmployee(
    row.employee,
    row.email,
    Boolean(row.isActive),
    row.role,
  );
  const joining = parseDate(row.employee.joiningDate);
  const now = new Date();
  const workDurationMonths = diffMonths(joining, now);
  const nextAnniversary = new Date(
    Date.UTC(
      now.getUTCFullYear() +
        (now.getUTCMonth() > joining.getUTCMonth() ||
        (now.getUTCMonth() === joining.getUTCMonth() &&
          now.getUTCDate() >= joining.getUTCDate())
          ? 1
          : 0),
      joining.getUTCMonth(),
      joining.getUTCDate(),
    ),
  );

  res.json({
    ...base,
    workDurationMonths,
    anniversaryDate: ymd(nextAnniversary),
    salaryEvents: events.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      type: e.type,
      amount: Number(e.amount),
      amountMode: e.amountMode ?? "fixed",
      percentValue: e.percentValue !== null ? Number(e.percentValue) : null,
      date: e.date,
      reason: e.reason,
    })),
  });
});

router.patch("/employees/:id", requireAuth(), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }
  const data = parsed.data;
  const actor = getUser(req);

  if (actor.role === "employee") {
    if (actor.employeeId !== id) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }
    const payload = data as Record<string, unknown>;
    const allowedKeys = Object.keys(payload).filter(
      (key) => payload[key] !== undefined,
    );
    const avatarOnly =
      allowedKeys.length > 0 &&
      allowedKeys.every((key) => key === "avatarUrl");
    if (!avatarOnly) {
      res.status(403).json({
        message: "Employees can only update their profile photo.",
      });
      return;
    }
  }

  const previousRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, id))
    .limit(1);
  const previous = previousRows[0];

  const updates: Partial<typeof employeesTable.$inferInsert> = {};
  const extra = data as Record<string, unknown>;
  const extraText = extra as Record<string, string | null | undefined>;
  if (data.name !== undefined) updates.name = data.name;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.position !== undefined) updates.position = data.position;
  if (data.department !== undefined) updates.department = data.department;
  if (data.positionType !== undefined) updates.positionType = data.positionType;
  if (data.casualLeaveQuota !== undefined)
    updates.casualLeaveQuota = data.casualLeaveQuota;
  if (data.sickLeaveQuota !== undefined)
    updates.sickLeaveQuota = data.sickLeaveQuota;
  if (data.annualLeaveQuota !== undefined)
    updates.annualLeaveQuota = data.annualLeaveQuota;
  if (data.joiningDate !== undefined)
    updates.joiningDate = data.joiningDate as unknown as string;
  if (data.probationMonths !== undefined)
    updates.probationMonths = data.probationMonths;
  if (data.officeStartTime !== undefined) {
    const normalizedStartTime = normalizeOfficeTime(data.officeStartTime);
    if (!normalizedStartTime) {
      res.status(400).json({ message: "Invalid office start time" });
      return;
    }
    updates.officeStartTime = normalizedStartTime;
  }
  if (data.officeEndTime !== undefined) {
    const normalizedEndTime = normalizeOfficeTime(data.officeEndTime);
    if (!normalizedEndTime) {
      res.status(400).json({ message: "Invalid office end time" });
      return;
    }
    updates.officeEndTime = normalizedEndTime;
  }
  if (data.gracePeriodMinutes !== undefined)
    updates.gracePeriodMinutes = data.gracePeriodMinutes;
  if (data.breakMinutes !== undefined)
    updates.breakMinutes = data.breakMinutes;
  if (data.basicSalary !== undefined)
    updates.basicSalary = String(data.basicSalary);
  if (data.allowances !== undefined)
    updates.allowances = String(data.allowances ?? 0);
  if (data.dateOfBirth !== undefined)
    updates.dateOfBirth = data.dateOfBirth as unknown as string | null;
  if (data.education !== undefined) updates.education = data.education;
  if (data.address !== undefined) updates.address = data.address;
  if (extraText.personalEmail !== undefined)
    updates.personalEmail = extraText.personalEmail;
  // New fields
  if (extraText.employeeCode !== undefined) updates.employeeCode = extraText.employeeCode;
  if (extraText.maritalStatus !== undefined)
    updates.maritalStatus = extraText.maritalStatus;
  if (extraText.wifeName !== undefined) updates.wifeName = extraText.wifeName;
  if (extra.wifeDateOfBirth !== undefined)
    updates.wifeDateOfBirth = extra.wifeDateOfBirth as string | null;
  if (extra.kidsCount !== undefined)
    updates.kidsCount =
      typeof extra.kidsCount === "number" ? String(extra.kidsCount) : null;
  if (extra.kidsNames !== undefined)
    updates.kidsNames = serializeKidsNames(extra.kidsNames);
  if (extraText.leftDate !== undefined) updates.leftDate = extraText.leftDate;
  if (extraText.emergencyContactName !== undefined)
    updates.emergencyContactName = extraText.emergencyContactName;
  if (extraText.emergencyContactNumber !== undefined)
    updates.emergencyContactNumber = extraText.emergencyContactNumber;
  if (extraText.emergencyContactRelation !== undefined)
    updates.emergencyContactRelation = extraText.emergencyContactRelation;
  if (extraText.emergencyContact !== undefined)
    updates.emergencyContact = extraText.emergencyContact;
  if (extraText.cnic !== undefined) updates.cnic = extraText.cnic;
  if (extraText.lastQualification !== undefined)
    updates.lastQualification = extraText.lastQualification;
  if (extraText.previousCompany !== undefined)
    updates.previousCompany = extraText.previousCompany;
  if (extra.lastPay !== undefined) updates.lastPay = extra.lastPay != null ? String(extra.lastPay) : null;
  if (extraText.benefits !== undefined) updates.benefits = extraText.benefits;
  if (extraText.notes !== undefined) updates.notes = extraText.notes;
  if (extraText.immediateFamily !== undefined)
    updates.immediateFamily = extraText.immediateFamily;
  if (extraText.avatarUrl !== undefined) updates.avatarUrl = extraText.avatarUrl;
  if (extraText.employmentContractUrl !== undefined)
    updates.employmentContractUrl = extraText.employmentContractUrl;
  if (extraText.employmentContractName !== undefined)
    updates.employmentContractName = extraText.employmentContractName;
  if (extraText.cnicDocumentUrl !== undefined)
    updates.cnicDocumentUrl = extraText.cnicDocumentUrl;
  if (extraText.cnicDocumentName !== undefined)
    updates.cnicDocumentName = extraText.cnicDocumentName;
  if (extraText.cnicFrontDocumentUrl !== undefined)
    updates.cnicFrontDocumentUrl = extraText.cnicFrontDocumentUrl;
  if (extraText.cnicFrontDocumentName !== undefined)
    updates.cnicFrontDocumentName = extraText.cnicFrontDocumentName;
  if (extraText.cnicBackDocumentUrl !== undefined)
    updates.cnicBackDocumentUrl = extraText.cnicBackDocumentUrl;
  if (extraText.cnicBackDocumentName !== undefined)
    updates.cnicBackDocumentName = extraText.cnicBackDocumentName;
  if (extraText.qualificationDocumentUrl !== undefined)
    updates.qualificationDocumentUrl = extraText.qualificationDocumentUrl;
  if (extraText.qualificationDocumentName !== undefined)
    updates.qualificationDocumentName = extraText.qualificationDocumentName;
  if (extraText.lastPayslipOneUrl !== undefined)
    updates.lastPayslipOneUrl = extraText.lastPayslipOneUrl;
  if (extraText.lastPayslipOneName !== undefined)
    updates.lastPayslipOneName = extraText.lastPayslipOneName;
  if (extraText.lastPayslipTwoUrl !== undefined)
    updates.lastPayslipTwoUrl = extraText.lastPayslipTwoUrl;
  if (extraText.lastPayslipTwoName !== undefined)
    updates.lastPayslipTwoName = extraText.lastPayslipTwoName;
  if (extraText.lastPayslipThreeUrl !== undefined)
    updates.lastPayslipThreeUrl = extraText.lastPayslipThreeUrl;
  if (extraText.lastPayslipThreeName !== undefined)
    updates.lastPayslipThreeName = extraText.lastPayslipThreeName;
  const hasBankPayload = [
    "bankAccountTitle",
    "bankAccountNumber",
    "bankName",
    "bankIban",
    "bankBranchCode",
    "primaryBankAccountTitle",
    "primaryBankAccountNumber",
    "primaryBankName",
    "primaryBankIban",
    "primaryBankBranchCode",
    "primaryBankBranchLocation",
    "secondaryBankAccountTitle",
    "secondaryBankAccountNumber",
    "secondaryBankName",
    "secondaryBankIban",
    "secondaryBankBranchCode",
    "secondaryBankBranchLocation",
  ].some((key) => extra[key] !== undefined);
  if (hasBankPayload) {
    Object.assign(updates, getEmployeeBankValues(extra));
  }
  if (extra.providentFundPercent !== undefined)
    updates.providentFundPercent =
      extra.providentFundPercent != null ? String(extra.providentFundPercent) : null;
  if (typeof req.body?.medicalEnabled === "boolean") {
    updates.medicalEnabled = req.body.medicalEnabled;
  }
  if (req.body?.medicalDailyLimit !== undefined) {
    updates.medicalDailyLimit = String(Number(req.body.medicalDailyLimit ?? 0) || 0);
  }
  if (req.body?.medicalOverallLimit !== undefined) {
    const overallLimit = String(Number(req.body.medicalOverallLimit ?? 0) || 0);
    updates.medicalOverallLimit = overallLimit;
    updates.medicalOpdLimit = "0";
    updates.medicalIpdLimit = overallLimit;
  }

  await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id));
  if (typeof extra.isActive === "boolean" && previous?.userId) {
    await db
      .update(usersTable)
      .set({ isActive: extra.isActive })
      .where(eq(usersTable.id, previous.userId));
  }
  const requestedRole = req.body?.role;
  if (
    previous?.userId &&
    (actor.role === "admin" ||
      (actor.role === "hr" && requestedRole !== "admin")) &&
    typeof requestedRole === "string" &&
    ["admin", "hr", "employee"].includes(requestedRole)
  ) {
    await db
      .update(usersTable)
      .set({ role: requestedRole as "admin" | "hr" | "employee" })
      .where(eq(usersTable.id, previous.userId));
    await notifyEmployeeUser(id, {
      type: "role_change",
      title: "Account role updated",
      message: `Your account role is now ${requestedRole.toUpperCase()}.`,
      href: requestedRole === "employee" || requestedRole === "hr" ? "/employee" : `/admin/employees/${id}`,
    });
  }
  const medicalChanged =
    previous &&
    (updates.medicalEnabled !== undefined ||
      updates.medicalDailyLimit !== undefined ||
      updates.medicalOverallLimit !== undefined);
  if (medicalChanged) {
    await notifyEmployeeUser(id, {
      type: "medical_allowance",
      title: "Medical allowance updated",
      message: "Your yearly IPD medical allowance or daily medical limit has been updated.",
      href: "/employee/medical",
    });
  }

  // Log designation change journey event
  if (
    previous &&
    data.position !== undefined &&
    data.position !== previous.position &&
    data.position
  ) {
    await db.insert(designationChangesTable).values({
      employeeId: id,
      fromTitle: previous.position ?? null,
      toTitle: data.position,
      effectiveDate: ymd(new Date()),
    });
  }

  const rows = await db
    .select({
      employee: employeesTable,
      email: usersTable.email,
      isActive: usersTable.isActive,
      role: usersTable.role,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }
  res.json(
    serializeEmployee(row.employee, row.email, Boolean(row.isActive), row.role),
  );
});

router.delete("/employees/:id", requireAuth(["admin"]), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, id))
    .limit(1);
  const emp = rows[0];
  if (!emp) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, emp.userId));
  res.json({ success: true });
});

router.get("/employees/:id/journey", requireAuth(), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const user = getUser(req);
  if (user.role === "employee" && user.employeeId !== id) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  const rows = await db
    .select({
      employee: employeesTable,
      email: usersTable.email,
      isActive: usersTable.isActive,
      role: usersTable.role,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Employee not found" });
    return;
  }

  const employee = serializeEmployee(
    row.employee,
    row.email,
    Boolean(row.isActive),
    row.role,
  );
  const joining = parseDate(row.employee.joiningDate);
  const probationEnd = subtractDay(addMonths(joining, row.employee.probationMonths));
  const nowYear = new Date().getUTCFullYear();

  const events: Array<{
    date: string;
    type:
      | "joining"
      | "probation_start"
      | "probation_end"
      | "anniversary"
      | "birthday"
      | "bonus"
      | "loan"
      | "increment"
      | "left"
      | "designation_change";
    title: string;
    description: string | null;
    amount: number | null;
  }> = [];

  events.push({
    date: row.employee.joiningDate,
    type: "joining",
    title: "Joined the company",
    description: row.employee.position
      ? `Started as ${row.employee.position}`
      : null,
    amount: null,
  });
  events.push({
    date: row.employee.joiningDate,
    type: "probation_start",
    title: "Probation started",
    description: `${row.employee.probationMonths} month probation period`,
    amount: null,
  });
  events.push({
    date: ymd(probationEnd),
    type: "probation_end",
    title: "Probation ended",
    description: "Permanent full-time employee",
    amount: null,
  });

  // Left the company event
  if (row.employee.leftDate) {
    events.push({
      date: row.employee.leftDate,
      type: "left",
      title: "Last day at company",
      description: null,
      amount: null,
    });
  }

  // Anniversaries since joining
  for (let y = joining.getUTCFullYear() + 1; y <= nowYear; y++) {
    const d = new Date(
      Date.UTC(y, joining.getUTCMonth(), joining.getUTCDate()),
    );
    events.push({
      date: ymd(d),
      type: "anniversary",
      title: `${y - joining.getUTCFullYear()} year anniversary`,
      description: null,
      amount: null,
    });
  }

  // Birthday this year
  if (row.employee.dateOfBirth) {
    const dob = parseDate(row.employee.dateOfBirth);
    const bday = new Date(
      Date.UTC(nowYear, dob.getUTCMonth(), dob.getUTCDate()),
    );
    events.push({
      date: ymd(bday),
      type: "birthday",
      title: "Birthday",
      description: null,
      amount: null,
    });
  }

  const salaryEvents = await db
    .select()
    .from(salaryEventsTable)
    .where(eq(salaryEventsTable.employeeId, id));

  for (const se of salaryEvents) {
    events.push({
      date: se.date,
      type: se.type as "bonus" | "loan" | "increment",
      title:
        se.type === "bonus"
          ? "Bonus awarded"
          : se.type === "loan"
            ? "Loan issued"
            : "Salary increment",
      description: se.reason ?? null,
      amount: Number(se.amount),
    });
  }

  // Designation changes
  const designationEvents = await db
    .select()
    .from(designationChangesTable)
    .where(eq(designationChangesTable.employeeId, id));
  for (const dc of designationEvents) {
    events.push({
      date: dc.effectiveDate,
      type: "designation_change",
      title: "Designation changed",
      description: dc.fromTitle
        ? `From ${dc.fromTitle} to ${dc.toTitle}`
        : `Promoted to ${dc.toTitle}`,
      amount: null,
    });
  }

  const today = ymd(new Date());
  const visibleEvents = events.filter((e) => e.date <= today);
  visibleEvents.sort((a, b) => (a.date < b.date ? -1 : 1));

  res.json({ employee, events: visibleEvents });
});

router.post(
  "/employees/:id/salary-events",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const parsed = CreateSalaryEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid payload" });
    return;
  }
    const settings = await getSettings();
    // Resolve amount based on amountMode (fixed | percentage)
    const mode = parsed.data.amountMode ?? "fixed";
    let resolvedAmount: number;
    let percentValue: number | null = null;
    if (mode === "percentage") {
      const pct = parsed.data.percentValue;
      const baseAmount = parsed.data.amount;
      if (pct === undefined || pct === null) {
        res
          .status(400)
          .json({ message: "percentValue is required when amountMode is 'percentage'" });
        return;
      }
      if (baseAmount === undefined || baseAmount === null) {
        res
          .status(400)
          .json({ message: "amount is required when amountMode is 'percentage'" });
        return;
      }
      resolvedAmount = Math.round(((baseAmount * pct) / 100) * 100) / 100;
      percentValue = pct;
    } else {
      if (parsed.data.amount === undefined || parsed.data.amount === null) {
        res
          .status(400)
          .json({ message: "amount is required when amountMode is 'fixed'" });
        return;
      }
      resolvedAmount = parsed.data.amount;
    }

    const inserted = await db
      .insert(salaryEventsTable)
      .values({
        employeeId: id,
        type: parsed.data.type,
        amount: String(resolvedAmount),
        amountMode: mode,
        percentValue: percentValue !== null ? String(percentValue) : null,
        date: parsed.data.date as unknown as string,
        reason: parsed.data.reason ?? null,
      })
      .$returningId();
    const eventId = inserted[0]?.id;
    if (!eventId) {
      res.status(500).json({ message: "Failed to create salary event" });
      return;
    }
    const eventRows = await db
      .select()
      .from(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId))
      .limit(1);
    const e = eventRows[0];
    if (!e) {
      res.status(500).json({ message: "Created salary event could not be loaded" });
      return;
    }

    // If increment, update the employee's basicSalary
    if (parsed.data.type === "increment") {
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, id))
        .limit(1);
      const emp = empRows[0];
      if (emp) {
        const nextCompensation = applyPermanentIncrementToCompensation(
          emp,
          resolvedAmount,
          settings,
        );
        await db
          .update(employeesTable)
          .set({
            basicSalary: String(nextCompensation.basicSalary),
            allowances: String(nextCompensation.allowances),
          })
          .where(eq(employeesTable.id, id));
      }
    }

    res.status(201).json({
      id: e.id,
      employeeId: e.employeeId,
      type: e.type,
      amount: Number(e.amount),
      amountMode: e.amountMode,
      percentValue: e.percentValue !== null ? Number(e.percentValue) : null,
      date: e.date,
      reason: e.reason,
    });
  },
);

router.patch(
  "/employees/:id/salary-events/:eventId",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const eventId = Number(req.params.eventId);
    const parsed = UpdateSalaryEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid payload" });
      return;
    }
    const settings = await getSettings();

    const existingRows = await db
      .select()
      .from(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ message: "Salary event not found" });
      return;
    }

    const nextType = parsed.data.type ?? existing.type;
    const nextMode = parsed.data.amountMode ?? existing.amountMode ?? "fixed";
    let nextPercentValue =
      parsed.data.percentValue !== undefined
        ? parsed.data.percentValue
        : existing.percentValue !== null
          ? Number(existing.percentValue)
          : null;
    let nextAmount: number;

    if (nextMode === "percentage") {
      if (nextPercentValue == null) {
        res.status(400).json({ message: "percentValue is required when amountMode is 'percentage'" });
        return;
      }
      const baseAmount =
        parsed.data.amount !== undefined
          ? parsed.data.amount
          : inferPercentageBaseAmount(Number(existing.amount), Number(existing.percentValue));
      nextAmount = Math.round(((baseAmount * nextPercentValue) / 100) * 100) / 100;
    } else {
      nextAmount =
        parsed.data.amount !== undefined ? parsed.data.amount : Number(existing.amount);
      nextPercentValue =
        parsed.data.percentValue !== undefined ? parsed.data.percentValue : null;
    }

    const updates: Partial<typeof salaryEventsTable.$inferInsert> = {
      amount: String(nextAmount),
      amountMode: nextMode,
      percentValue: nextPercentValue != null ? String(nextPercentValue) : null,
    };
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.date !== undefined)
      updates.date = parsed.data.date as unknown as string;
    if (parsed.data.reason !== undefined)
      updates.reason = parsed.data.reason ?? null;

    await db
      .update(salaryEventsTable)
      .set(updates)
      .where(eq(salaryEventsTable.id, eventId));

    // Reverse-and-reapply increment effect on the employee's basicSalary if needed
    const wasIncrement = existing.type === "increment";
    const isIncrement = nextType === "increment";
    if (wasIncrement || isIncrement) {
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, id))
        .limit(1);
      const emp = empRows[0];
      if (emp) {
        const currentTotal = Number(emp.basicSalary) + Number(emp.allowances);
        let nextTotal = currentTotal;
        if (wasIncrement) nextTotal -= Number(existing.amount);
        if (isIncrement) nextTotal += nextAmount;
        const nextCompensation = splitCompensationBySettings(
          Math.max(0, nextTotal),
          settings,
        );
        await db
          .update(employeesTable)
          .set({
            basicSalary: String(nextCompensation.basicSalary),
            allowances: String(nextCompensation.allowances),
          })
          .where(eq(employeesTable.id, id));
      }
    }

    const updatedRows = await db
      .select()
      .from(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId))
      .limit(1);
    const e = updatedRows[0]!;
    res.json({
      id: e.id,
      employeeId: e.employeeId,
      type: e.type,
      amount: Number(e.amount),
      amountMode: e.amountMode,
      percentValue: e.percentValue !== null ? Number(e.percentValue) : null,
      date: e.date,
      reason: e.reason,
    });
  },
);

router.delete(
  "/employees/:id/salary-events/:eventId",
  requireAuth(["admin", "hr"]),
  async (req, res) => {
    const id = Number(req.params.id);
    const eventId = Number(req.params.eventId);
    const settings = await getSettings();
    const existingRows = await db
      .select()
      .from(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      res.status(404).json({ message: "Salary event not found" });
      return;
    }
    if (existing.type === "increment") {
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, id))
        .limit(1);
      const emp = empRows[0];
      if (emp) {
        const currentTotal = Number(emp.basicSalary) + Number(emp.allowances) - Number(existing.amount);
        const nextCompensation = splitCompensationBySettings(
          Math.max(0, currentTotal),
          settings,
        );
        await db
          .update(employeesTable)
          .set({
            basicSalary: String(nextCompensation.basicSalary),
            allowances: String(nextCompensation.allowances),
          })
          .where(eq(employeesTable.id, id));
      }
    }
    await db
      .delete(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId));
    res.json({ success: true });
  },
);

export default router;
