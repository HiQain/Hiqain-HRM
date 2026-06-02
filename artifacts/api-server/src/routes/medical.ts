import { Router, type IRouter } from "express";
import {
  db,
  employeesTable,
  medicalClaimsTable,
  usersTable,
} from "@workspace/db";
import { and, desc, eq, ne } from "drizzle-orm";
import { getUser, requireAuth } from "../lib/auth";
import {
  notifyEmployeeUser,
  notifyRoles,
} from "../lib/notifications";

const router: IRouter = Router();

type DependentRelation = "self" | "spouse" | "child";
type TreatmentType = "opd" | "ipd";

function serializeDependents(employee: typeof employeesTable.$inferSelect) {
  const dependents: Array<{ relation: DependentRelation; name: string }> = [
    { relation: "self", name: employee.name },
  ];

  if (
    String(employee.maritalStatus ?? "").trim().toLowerCase() === "married" &&
    employee.wifeName?.trim()
  ) {
    dependents.push({ relation: "spouse", name: employee.wifeName.trim() });
  }

  const kids = (() => {
    if (!employee.kidsNames) return [];
    try {
      const parsed = JSON.parse(employee.kidsNames);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return employee.kidsNames.split(",").map((item) => item.trim());
    }
  })();

  for (const kid of kids) {
    if (typeof kid === "string" && kid.trim()) {
      dependents.push({ relation: "child", name: kid.trim() });
    }
  }

  return dependents;
}

function serializeMedicalClaim(
  row: typeof medicalClaimsTable.$inferSelect,
  employeeName: string,
) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName,
    dependentRelation: row.dependentRelation,
    dependentName: row.dependentName,
    treatmentType: row.treatmentType,
    claimDate: row.claimDate,
    hospitalName: row.hospitalName,
    doctorName: row.doctorName,
    amount: Number(row.amount),
    approvedAmount: row.approvedAmount != null ? Number(row.approvedAmount) : null,
    notes: row.notes,
    reviewNote: row.reviewNote,
    attachmentUrl: row.attachmentUrl,
    attachmentName: row.attachmentName,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getEmployeeWithUser(employeeId: number) {
  const rows = await db
    .select({
      employee: employeesTable,
      email: usersTable.email,
      role: usersTable.role,
      userId: usersTable.id,
    })
    .from(employeesTable)
    .innerJoin(usersTable, eq(usersTable.id, employeesTable.userId))
    .where(eq(employeesTable.id, employeeId))
    .limit(1);
  return rows[0] ?? null;
}

async function buildMedicalSummary(
  employeeId: number,
  opts?: { excludeClaimId?: number | null },
) {
  const employeeRow = await getEmployeeWithUser(employeeId);
  if (!employeeRow) {
    throw new Error("Employee not found");
  }

  const filters = [eq(medicalClaimsTable.employeeId, employeeId), ne(medicalClaimsTable.status, "rejected")];
  if (opts?.excludeClaimId) {
    filters.push(ne(medicalClaimsTable.id, opts.excludeClaimId));
  }

  const claims = await db
    .select()
    .from(medicalClaimsTable)
    .where(and(...filters));

  const totalUsed = claims.reduce(
    (sum, claim) => sum + Number(claim.approvedAmount ?? claim.amount ?? 0),
    0,
  );
  const opdUsed = claims
    .filter((claim) => claim.treatmentType === "opd")
    .reduce((sum, claim) => sum + Number(claim.approvedAmount ?? claim.amount ?? 0), 0);
  const ipdUsed = claims
    .filter((claim) => claim.treatmentType === "ipd")
    .reduce((sum, claim) => sum + Number(claim.approvedAmount ?? claim.amount ?? 0), 0);

  const dailyMap = new Map<string, number>();
  for (const claim of claims) {
    dailyMap.set(
      claim.claimDate,
      (dailyMap.get(claim.claimDate) ?? 0) +
        Number(claim.approvedAmount ?? claim.amount ?? 0),
    );
  }

  const employee = employeeRow.employee;
  const overallLimit = Number(employee.medicalOverallLimit ?? 0);
  return {
    employee: employeeRow.employee,
    userId: employeeRow.userId,
    email: employeeRow.email,
    role: employeeRow.role,
    dependents: serializeDependents(employee),
    medicalEnabled: Boolean(employee.medicalEnabled),
    limits: {
      daily: Number(employee.medicalDailyLimit ?? 0),
      overall: overallLimit,
      opd: 0,
      ipd: overallLimit,
    },
    used: {
      overall: totalUsed,
      opd: opdUsed,
      ipd: ipdUsed,
      dailyByDate: Object.fromEntries(dailyMap.entries()),
    },
    remaining: {
      overall: Math.max(0, overallLimit - totalUsed),
      opd: 0,
      ipd: Math.max(0, overallLimit - ipdUsed),
    },
  };
}

function parsePositiveAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100) / 100;
}

function normalizeRelation(value: unknown): DependentRelation {
  return value === "spouse" || value === "child" ? value : "self";
}

function normalizeTreatmentType(value: unknown): TreatmentType | null {
  return value === "ipd" || value === "opd" ? value : null;
}

function ensureClaimAgainstLimits(
  summary: Awaited<ReturnType<typeof buildMedicalSummary>>,
  claimDate: string,
  treatmentType: TreatmentType,
  amount: number,
) {
  if (!summary.medicalEnabled) {
    throw new Error("Medical coverage is not enabled for this employee.");
  }

  const dailyLimit = summary.limits.daily;
  const overallLimit = summary.limits.overall;
  const typeLimit = treatmentType === "opd" ? summary.limits.opd : summary.limits.ipd;
  const typeRemaining =
    treatmentType === "opd" ? summary.remaining.opd : summary.remaining.ipd;
  const alreadyUsedForDate = summary.used.dailyByDate[claimDate] ?? 0;

  if (dailyLimit <= 0 || overallLimit <= 0 || typeLimit <= 0) {
    throw new Error("Medical limits are not configured for this employee.");
  }
  if (alreadyUsedForDate + amount > dailyLimit) {
    throw new Error(
      `Daily limit exceeded. Remaining for ${claimDate}: ${Math.max(0, dailyLimit - alreadyUsedForDate).toFixed(2)}`,
    );
  }
  if (amount > summary.remaining.overall) {
    throw new Error(
      `Overall medical limit exceeded. Remaining balance: ${summary.remaining.overall.toFixed(2)}`,
    );
  }
  if (amount > typeRemaining) {
    throw new Error(
      `${treatmentType.toUpperCase()} limit exceeded. Remaining ${treatmentType.toUpperCase()} balance: ${typeRemaining.toFixed(2)}`,
    );
  }
}

router.get("/medical/summary", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  const requestedEmployeeId =
    actor.role === "employee"
      ? actor.employeeId
      : Number(req.query.employeeId ?? 0) || actor.employeeId;

  if (!requestedEmployeeId) {
    res.status(400).json({ message: "employeeId required" });
    return;
  }

  try {
    const summary = await buildMedicalSummary(requestedEmployeeId);
    res.json(summary);
  } catch (error) {
    res.status(404).json({ message: error instanceof Error ? error.message : "Employee not found" });
  }
});

router.get("/medical/claims", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  const requestedEmployeeId = Number(req.query.employeeId ?? 0) || null;
  const status =
    req.query.status === "pending" ||
    req.query.status === "approved" ||
    req.query.status === "rejected"
      ? req.query.status
      : null;

  const filters: any[] = [];
  if (actor.role === "employee") {
    if (!actor.employeeId) {
      res.json([]);
      return;
    }
    filters.push(eq(medicalClaimsTable.employeeId, actor.employeeId));
  } else if (requestedEmployeeId) {
    filters.push(eq(medicalClaimsTable.employeeId, requestedEmployeeId));
  }

  if (status) {
    filters.push(eq(medicalClaimsTable.status, status));
  }

  const rows = await db
    .select({
      claim: medicalClaimsTable,
      employeeName: employeesTable.name,
    })
    .from(medicalClaimsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, medicalClaimsTable.employeeId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(medicalClaimsTable.createdAt));

  res.json(rows.map((row) => serializeMedicalClaim(row.claim, row.employeeName)));
});

router.post("/medical/claims", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  const employeeId =
    actor.role === "employee"
      ? actor.employeeId
      : Number(req.body?.employeeId ?? 0) || null;
  const treatmentType = normalizeTreatmentType(req.body?.treatmentType);
  const dependentRelation = normalizeRelation(req.body?.dependentRelation);
  const claimDate = typeof req.body?.claimDate === "string" ? req.body.claimDate : "";
  const amount = parsePositiveAmount(req.body?.amount);

  if (!employeeId || !treatmentType || !claimDate || !amount) {
    res.status(400).json({ message: "employeeId, treatmentType, claimDate, and amount are required" });
    return;
  }

  try {
    const summary = await buildMedicalSummary(employeeId);
    const dependentName =
      dependentRelation === "self"
        ? summary.employee.name
        : typeof req.body?.dependentName === "string"
          ? req.body.dependentName.trim()
          : "";

    if (
      dependentRelation !== "self" &&
      !summary.dependents.some(
        (item) =>
          item.relation === dependentRelation &&
          item.name.toLowerCase() === dependentName.toLowerCase(),
      )
    ) {
      throw new Error("Selected dependent is not covered in this employee's medical list.");
    }

    ensureClaimAgainstLimits(summary, claimDate, treatmentType, amount);

    const inserted = await db
      .insert(medicalClaimsTable)
      .values({
        employeeId,
        createdByUserId: actor.id,
        dependentRelation,
        dependentName: dependentName || null,
        treatmentType,
        claimDate,
        hospitalName:
          typeof req.body?.hospitalName === "string" ? req.body.hospitalName.trim() || null : null,
        doctorName:
          typeof req.body?.doctorName === "string" ? req.body.doctorName.trim() || null : null,
        amount: String(amount),
        notes: typeof req.body?.notes === "string" ? req.body.notes.trim() || null : null,
        attachmentUrl:
          typeof req.body?.attachmentUrl === "string" ? req.body.attachmentUrl.trim() || null : null,
        attachmentName:
          typeof req.body?.attachmentName === "string" ? req.body.attachmentName.trim() || null : null,
      })
      .$returningId();

    const claimId = inserted[0]?.id;
    if (!claimId) {
      res.status(500).json({ message: "Could not create medical claim" });
      return;
    }

    const rows = await db
      .select({
        claim: medicalClaimsTable,
        employeeName: employeesTable.name,
      })
      .from(medicalClaimsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, medicalClaimsTable.employeeId))
      .where(eq(medicalClaimsTable.id, claimId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      res.status(500).json({ message: "Could not load medical claim" });
      return;
    }

    const href =
      actor.role === "employee" ? "/employee/medical" : "/admin/medical";
    await notifyRoles(["admin", "hr"], {
      type: "medical_claim",
      title: "New medical claim",
      message: `${row.employeeName} submitted a ${treatmentType.toUpperCase()} medical claim for ${amount.toFixed(2)}.`,
      href: "/admin/medical",
    });
    await notifyEmployeeUser(employeeId, {
      type: "medical_claim",
      title: "Medical claim submitted",
      message: `Your ${treatmentType.toUpperCase()} medical claim has been submitted.`,
      href,
    });

    res.status(201).json(serializeMedicalClaim(row.claim, row.employeeName));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not create medical claim" });
  }
});

router.patch("/medical/claims/:id", requireAuth(), async (req, res): Promise<void> => {
  const actor = getUser(req);
  const id = Number(req.params.id);
  const rows = await db
    .select({
      claim: medicalClaimsTable,
      employeeName: employeesTable.name,
    })
    .from(medicalClaimsTable)
    .innerJoin(employeesTable, eq(employeesTable.id, medicalClaimsTable.employeeId))
    .where(eq(medicalClaimsTable.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ message: "Medical claim not found" });
    return;
  }

  if (
    actor.role === "employee" &&
    (actor.employeeId !== row.claim.employeeId || row.claim.status !== "pending")
  ) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const updates: Partial<typeof medicalClaimsTable.$inferInsert> = {};
  const treatmentType =
    req.body?.treatmentType !== undefined
      ? normalizeTreatmentType(req.body.treatmentType)
      : row.claim.treatmentType;
  const claimDate =
    typeof req.body?.claimDate === "string" && req.body.claimDate
      ? req.body.claimDate
      : row.claim.claimDate;
  const amount =
    req.body?.amount !== undefined
      ? parsePositiveAmount(req.body.amount)
      : Number(row.claim.amount);
  if (!treatmentType || !amount) {
    res.status(400).json({ message: "Invalid treatment type or amount" });
    return;
  }

  try {
    const summary = await buildMedicalSummary(row.claim.employeeId, {
      excludeClaimId: row.claim.id,
    });
    const dependentRelation =
      req.body?.dependentRelation !== undefined
        ? normalizeRelation(req.body.dependentRelation)
        : row.claim.dependentRelation;
    const dependentName =
      dependentRelation === "self"
        ? summary.employee.name
        : typeof req.body?.dependentName === "string"
          ? req.body.dependentName.trim()
          : row.claim.dependentName ?? "";

    if (
      dependentRelation !== "self" &&
      !summary.dependents.some(
        (item) =>
          item.relation === dependentRelation &&
          item.name.toLowerCase() === dependentName.toLowerCase(),
      )
    ) {
      throw new Error("Selected dependent is not covered in this employee's medical list.");
    }

    ensureClaimAgainstLimits(summary, claimDate, treatmentType, amount);

    updates.dependentRelation = dependentRelation;
    updates.dependentName = dependentName || null;
    updates.treatmentType = treatmentType;
    updates.claimDate = claimDate;
    updates.amount = String(amount);
    if (req.body?.hospitalName !== undefined) {
      updates.hospitalName =
        typeof req.body.hospitalName === "string" ? req.body.hospitalName.trim() || null : null;
    }
    if (req.body?.doctorName !== undefined) {
      updates.doctorName =
        typeof req.body.doctorName === "string" ? req.body.doctorName.trim() || null : null;
    }
    if (req.body?.notes !== undefined) {
      updates.notes =
        typeof req.body.notes === "string" ? req.body.notes.trim() || null : null;
    }
    if (req.body?.attachmentUrl !== undefined) {
      updates.attachmentUrl =
        typeof req.body.attachmentUrl === "string" ? req.body.attachmentUrl.trim() || null : null;
    }
    if (req.body?.attachmentName !== undefined) {
      updates.attachmentName =
        typeof req.body.attachmentName === "string" ? req.body.attachmentName.trim() || null : null;
    }

    if (actor.role !== "employee") {
      const nextStatus =
        req.body?.status === "approved" || req.body?.status === "rejected" || req.body?.status === "pending"
          ? req.body.status
          : row.claim.status;
      updates.status = nextStatus;
      updates.reviewNote =
        typeof req.body?.reviewNote === "string" ? req.body.reviewNote.trim() || null : row.claim.reviewNote;
      if (nextStatus === "approved") {
        const approvedAmount =
          req.body?.approvedAmount !== undefined
            ? parsePositiveAmount(req.body.approvedAmount)
            : amount;
        if (!approvedAmount) {
          throw new Error("Approved amount must be greater than zero.");
        }
        ensureClaimAgainstLimits(summary, claimDate, treatmentType, approvedAmount);
        updates.approvedAmount = String(approvedAmount);
        updates.reviewedByUserId = actor.id;
        updates.reviewedAt = new Date();
      } else if (nextStatus === "rejected") {
        updates.approvedAmount = null;
        updates.reviewedByUserId = actor.id;
        updates.reviewedAt = new Date();
      } else {
        updates.approvedAmount = null;
      }
    }

    await db.update(medicalClaimsTable).set(updates).where(eq(medicalClaimsTable.id, id));

    const updatedRows = await db
      .select({
        claim: medicalClaimsTable,
        employeeName: employeesTable.name,
      })
      .from(medicalClaimsTable)
      .innerJoin(employeesTable, eq(employeesTable.id, medicalClaimsTable.employeeId))
      .where(eq(medicalClaimsTable.id, id))
      .limit(1);
    const updated = updatedRows[0];
    if (!updated) {
      res.status(404).json({ message: "Medical claim not found after update" });
      return;
    }

    if (actor.role !== "employee" && updates.status && updates.status !== "pending") {
      await notifyEmployeeUser(updated.claim.employeeId, {
        type: "medical_claim",
        title:
          updates.status === "approved"
            ? "Medical claim approved"
            : "Medical claim rejected",
        message:
          updates.status === "approved"
            ? `Your ${updated.claim.treatmentType.toUpperCase()} medical claim was approved.`
            : `Your ${updated.claim.treatmentType.toUpperCase()} medical claim was rejected.`,
        href: "/employee/medical",
      });
    }

    res.json(serializeMedicalClaim(updated.claim, updated.employeeName));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Could not update medical claim" });
  }
});

export default router;
