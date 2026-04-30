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
import { getSettings } from "./settings";

const router: IRouter = Router();

function subtractDay(d: Date): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() - 1);
  return r;
}

function serializeEmployee(
  e: typeof employeesTable.$inferSelect,
  email: string,
) {
  const joining = parseDate(e.joiningDate);
  const probationEnd = subtractDay(addMonths(joining, e.probationMonths));
  return {
    id: e.id,
    userId: e.userId,
    name: e.name,
    email,
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
    leftDate: e.leftDate,
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
    providentFundPercent:
      e.providentFundPercent != null ? Number(e.providentFundPercent) : null,
  };
}

router.get("/employees", requireAuth(["admin", "hr"]), async (_req, res) => {
  const rows = await db
    .select({
      employee: employeesTable,
      email: usersTable.email,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .orderBy(desc(employeesTable.createdAt));
  res.json(rows.map(({ employee, email }) => serializeEmployee(employee, email)));
});

function proRatedQuota(quota: number, joiningDate: string): number {
  const j = parseDate(joiningDate);
  const today = new Date();
  if (
    j.getUTCFullYear() < today.getUTCFullYear() ||
    j.getUTCMonth() === 0
  ) {
    return quota;
  }
  const monthsRemaining = 12 - j.getUTCMonth();
  return Math.round((quota * monthsRemaining) / 12);
}

router.post("/employees", requireAuth(["admin", "hr"]), async (req, res) => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid employee payload" });
  }
  const data = parsed.data;
  const actor = getUser(req);
  const email = data.email.toLowerCase();
  const settings = await getSettings();

  // Only admins can create another admin (HR cannot escalate privileges).
  if (data.role === "admin" && actor.role !== "admin") {
    return res
      .status(403)
      .json({ message: "Only admins can create another admin." });
  }
  const resolvedRole: "admin" | "hr" | "employee" =
    data.role === "admin" ? "admin" : data.role === "hr" ? "hr" : "employee";

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length) {
    return res.status(400).json({ message: "Email already exists" });
  }

  const passwordHash = await hashPassword(data.password);
  const insertedUser = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      role: resolvedRole,
      mustChangePassword: true,
    })
    .returning();
  const user = insertedUser[0]!;

  // Auto-generate employee code if not provided
  const allEmps = await db.select({ id: employeesTable.id }).from(employeesTable);
  const nextNum = allEmps.length + 1;
  const autoCode = `EMP-${String(nextNum).padStart(3, "0")}`;

  const joiningDateStr = data.joiningDate as unknown as string;
  const baseCasual = data.casualLeaveQuota ?? settings.defaultCasualLeaveQuota;
  const baseSick = data.sickLeaveQuota ?? settings.defaultSickLeaveQuota;
  const baseAnnual = data.annualLeaveQuota ?? settings.defaultAnnualLeaveQuota;
  const casualLeaveQuota = settings.proRatedQuotas
    ? proRatedQuota(baseCasual, joiningDateStr)
    : baseCasual;
  const sickLeaveQuota = settings.proRatedQuotas
    ? proRatedQuota(baseSick, joiningDateStr)
    : baseSick;
  const annualLeaveQuota = settings.proRatedQuotas
    ? proRatedQuota(baseAnnual, joiningDateStr)
    : baseAnnual;

  const insertedEmp = await db
    .insert(employeesTable)
    .values({
      userId: user.id,
      name: data.name,
      phone: data.phone ?? null,
      position: data.position ?? null,
      department: data.department ?? null,
      positionType: data.positionType ?? "onsite",
      joiningDate: joiningDateStr,
      probationMonths: data.probationMonths ?? settings.defaultProbationMonths,
      officeStartTime: data.officeStartTime ?? settings.defaultOfficeStartTime,
      officeEndTime: data.officeEndTime ?? settings.defaultOfficeEndTime,
      gracePeriodMinutes:
        data.gracePeriodMinutes ?? settings.defaultGracePeriodMinutes,
      basicSalary: String(data.basicSalary),
      allowances: String(data.allowances ?? 0),
      casualLeaveQuota,
      sickLeaveQuota,
      annualLeaveQuota,
      dateOfBirth: (data.dateOfBirth as unknown as string) ?? null,
      education: data.education ?? null,
      address: data.address ?? null,
      employeeCode: (data as any).employeeCode ?? autoCode,
    })
    .returning();
  res.status(201).json(serializeEmployee(insertedEmp[0]!, email));
});

router.post("/employees/bulk", requireAuth(["admin", "hr"]), async (req, res) => {
  const members = req.body?.members;
  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ message: "members array required" });
  }
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
    const exists = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);
    if (exists.length) {
      failed += 1;
      errors.push({ row: i + 1, email, message: "Email already exists" });
      continue;
    }
    try {
      const requestedRole: "admin" | "hr" | "employee" =
        data.role === "admin" ? "admin" : data.role === "hr" ? "hr" : "employee";
      // Only admins can create another admin during bulk import.
      const bulkActor = getUser(req);
      const safeRole: "admin" | "hr" | "employee" =
        requestedRole === "admin" && bulkActor.role !== "admin"
          ? "employee"
          : requestedRole;
      const passwordHash = await hashPassword(data.password);
      const insertedUser = await db
        .insert(usersTable)
        .values({
          email,
          passwordHash,
          role: safeRole,
          mustChangePassword: true,
        })
        .returning();
      const user = insertedUser[0]!;
      const allEmps = await db.select({ id: employeesTable.id }).from(employeesTable);
      const autoCode = `EMP-${String(allEmps.length + 1).padStart(3, "0")}`;
      await db.insert(employeesTable).values({
        userId: user.id,
        name: data.name,
        phone: data.phone ?? null,
        position: data.position ?? null,
        department: data.department ?? null,
        positionType: data.positionType ?? "onsite",
        joiningDate: data.joiningDate as unknown as string,
        probationMonths: data.probationMonths,
        officeStartTime: data.officeStartTime,
        officeEndTime: data.officeEndTime,
        gracePeriodMinutes: data.gracePeriodMinutes,
        basicSalary: String(data.basicSalary),
        allowances: String(data.allowances ?? 0),
        casualLeaveQuota: data.casualLeaveQuota ?? 10,
        sickLeaveQuota: data.sickLeaveQuota ?? 10,
        annualLeaveQuota: data.annualLeaveQuota ?? 14,
        dateOfBirth: (data.dateOfBirth as unknown as string) ?? null,
        education: data.education ?? null,
        address: data.address ?? null,
        employeeCode: autoCode,
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
  const user = getUser(req);
  if (user.role === "employee" && user.employeeId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const rows = await db
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: "Employee not found" });

  const events = await db
    .select()
    .from(salaryEventsTable)
    .where(eq(salaryEventsTable.employeeId, id))
    .orderBy(desc(salaryEventsTable.date));

  const base = serializeEmployee(row.employee, row.email);
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

router.patch("/employees/:id", requireAuth(["admin", "hr"]), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = UpdateEmployeeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }
  const data = parsed.data;

  const previousRows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, id))
    .limit(1);
  const previous = previousRows[0];

  const updates: Partial<typeof employeesTable.$inferInsert> = {};
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
  if (data.officeStartTime !== undefined)
    updates.officeStartTime = data.officeStartTime;
  if (data.officeEndTime !== undefined)
    updates.officeEndTime = data.officeEndTime;
  if (data.gracePeriodMinutes !== undefined)
    updates.gracePeriodMinutes = data.gracePeriodMinutes;
  if (data.basicSalary !== undefined)
    updates.basicSalary = String(data.basicSalary);
  if (data.allowances !== undefined)
    updates.allowances = String(data.allowances ?? 0);
  if (data.dateOfBirth !== undefined)
    updates.dateOfBirth = data.dateOfBirth as unknown as string | null;
  if (data.education !== undefined) updates.education = data.education;
  if (data.address !== undefined) updates.address = data.address;
  // New fields
  const extra = data as any;
  if (extra.employeeCode !== undefined) updates.employeeCode = extra.employeeCode;
  if (extra.leftDate !== undefined) updates.leftDate = extra.leftDate;
  if (extra.emergencyContact !== undefined) updates.emergencyContact = extra.emergencyContact;
  if (extra.cnic !== undefined) updates.cnic = extra.cnic;
  if (extra.lastQualification !== undefined) updates.lastQualification = extra.lastQualification;
  if (extra.previousCompany !== undefined) updates.previousCompany = extra.previousCompany;
  if (extra.lastPay !== undefined) updates.lastPay = extra.lastPay != null ? String(extra.lastPay) : null;
  if (extra.benefits !== undefined) updates.benefits = extra.benefits;
  if (extra.notes !== undefined) updates.notes = extra.notes;
  if (extra.immediateFamily !== undefined) updates.immediateFamily = extra.immediateFamily;
  if (extra.avatarUrl !== undefined) updates.avatarUrl = extra.avatarUrl;
  if (extra.employmentContractUrl !== undefined)
    updates.employmentContractUrl = extra.employmentContractUrl;
  if (extra.employmentContractName !== undefined)
    updates.employmentContractName = extra.employmentContractName;
  if (extra.providentFundPercent !== undefined)
    updates.providentFundPercent =
      extra.providentFundPercent != null ? String(extra.providentFundPercent) : null;

  await db.update(employeesTable).set(updates).where(eq(employeesTable.id, id));

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
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: "Employee not found" });
  res.json(serializeEmployee(row.employee, row.email));
});

router.delete("/employees/:id", requireAuth(["admin"]), async (req, res) => {
  const id = Number(req.params.id);
  const rows = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.id, id))
    .limit(1);
  const emp = rows[0];
  if (!emp) return res.status(404).json({ message: "Employee not found" });
  await db.delete(usersTable).where(eq(usersTable.id, emp.userId));
  res.json({ success: true });
});

router.get("/employees/:id/journey", requireAuth(), async (req, res) => {
  const id = Number(req.params.id);
  const user = getUser(req);
  if (user.role === "employee" && user.employeeId !== id) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const rows = await db
    .select({ employee: employeesTable, email: usersTable.email })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return res.status(404).json({ message: "Employee not found" });

  const employee = serializeEmployee(row.employee, row.email);
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
  async (req, res) => {
    const id = Number(req.params.id);
    const parsed = CreateSalaryEventBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload" });
    }
    // Resolve amount based on amountMode (fixed | percentage)
    const mode = parsed.data.amountMode ?? "fixed";
    let resolvedAmount: number;
    let percentValue: number | null = null;
    if (mode === "percentage") {
      const pct = parsed.data.percentValue;
      if (pct === undefined || pct === null) {
        return res
          .status(400)
          .json({ message: "percentValue is required when amountMode is 'percentage'" });
      }
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, id))
        .limit(1);
      const emp = empRows[0];
      if (!emp) {
        return res.status(404).json({ message: "Employee not found" });
      }
      const basic = Number(emp.basicSalary);
      resolvedAmount = Math.round(((basic * pct) / 100) * 100) / 100;
      percentValue = pct;
    } else {
      if (parsed.data.amount === undefined || parsed.data.amount === null) {
        return res
          .status(400)
          .json({ message: "amount is required when amountMode is 'fixed'" });
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
      .returning();
    const e = inserted[0]!;

    // If increment, update the employee's basicSalary
    if (parsed.data.type === "increment") {
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, id))
        .limit(1);
      const emp = empRows[0];
      if (emp) {
        const newSalary = Number(emp.basicSalary) + resolvedAmount;
        await db
          .update(employeesTable)
          .set({ basicSalary: String(newSalary) })
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
  async (req, res) => {
    const id = Number(req.params.id);
    const eventId = Number(req.params.eventId);
    const parsed = UpdateSalaryEventBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const existingRows = await db
      .select()
      .from(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId))
      .limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ message: "Salary event not found" });
    }

    const updates: Partial<typeof salaryEventsTable.$inferInsert> = {};
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.amount !== undefined)
      updates.amount = String(parsed.data.amount);
    if (parsed.data.amountMode !== undefined && parsed.data.amountMode !== null)
      updates.amountMode = parsed.data.amountMode;
    if (parsed.data.percentValue !== undefined)
      updates.percentValue =
        parsed.data.percentValue !== null
          ? String(parsed.data.percentValue)
          : null;
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
    const newType = parsed.data.type ?? existing.type;
    const newAmount =
      parsed.data.amount !== undefined
        ? Number(parsed.data.amount)
        : Number(existing.amount);
    const isIncrement = newType === "increment";
    if (wasIncrement || isIncrement) {
      const empRows = await db
        .select()
        .from(employeesTable)
        .where(eq(employeesTable.id, id))
        .limit(1);
      const emp = empRows[0];
      if (emp) {
        let salary = Number(emp.basicSalary);
        if (wasIncrement) salary -= Number(existing.amount);
        if (isIncrement) salary += newAmount;
        await db
          .update(employeesTable)
          .set({ basicSalary: String(salary) })
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
  requireAuth(["admin"]),
  async (req, res) => {
    const eventId = Number(req.params.eventId);
    await db
      .delete(salaryEventsTable)
      .where(eq(salaryEventsTable.id, eventId));
    res.json({ success: true });
  },
);

export default router;
