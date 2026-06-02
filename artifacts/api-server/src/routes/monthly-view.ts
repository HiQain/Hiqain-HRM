import { Router, type IRouter } from "express";
import {
  attendanceTable,
  db,
  employeesTable,
  leaveRequestsTable,
  payslipsTable,
  salaryComponentsTable,
  salaryEventsTable,
} from "@workspace/db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { normalizeAttendanceStatus } from "../lib/attendance";
import { addMonths, parseDate, ymd } from "../lib/dates";
import { computePakistanMonthlySalaryTax } from "../lib/payroll";
import { requireAuth } from "../lib/auth";
import { resolveCompensationForDate } from "../lib/salary";
import { getSettings } from "./settings";

const router: IRouter = Router();

function subtractDay(d: Date): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() - 1);
  return next;
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function resolveComponentValue(
  component: typeof salaryComponentsTable.$inferSelect,
  basicSalary: number,
  grossSalaryBase: number,
) {
  return component.valueType === "percentage"
    ? (Number(component.value) / 100) *
        (component.percentageBase === "gross_salary"
          ? grossSalaryBase
          : basicSalary)
    : Number(component.value);
}

function isManualTaxComponent(label: string) {
  return /\btax\b/i.test(label);
}

function isComponentTaxable(component: typeof salaryComponentsTable.$inferSelect) {
  return component.isTaxable === 1;
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  return {
    start,
    end: ymd(endDate),
    endDate,
    daysInMonth: endDate.getUTCDate(),
  };
}

function eachDateInclusive(start: string, end: string) {
  const out: string[] = [];
  const cursor = parseDate(start);
  const endDate = parseDate(end);
  while (cursor <= endDate) {
    out.push(ymd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function statusCellLabel(
  status: string,
  leaveType?: "annual" | "casual" | "sick" | null,
) {
  if (leaveType === "annual") return "AL";
  if (leaveType === "casual") return "CL";
  if (leaveType === "sick") return "SL";
  switch (status) {
    case "present":
      return "P";
    case "late":
      return "L";
    case "absent":
      return "A";
    case "on_leave":
      return "LV";
    case "half_day":
      return "HD";
    case "remote_work":
      return "RW";
    case "off":
      return "OFF";
    case "inactive":
      return "—";
    default:
      return "";
  }
}

function computePayrollTaxFromPayslip(
  payslip: typeof payslipsTable.$inferSelect,
  components: Array<typeof salaryComponentsTable.$inferSelect>,
) {
  const basicSalary = Number(payslip.basicSalary);
  const defaultAllowances = Number(payslip.allowances);
  const grossSalaryBase = basicSalary + defaultAllowances;
  let commissionTotal = 0;
  let taxableCommissionTotal = 0;
  let taxableRecurringComponentTotal = 0;

  for (const component of components) {
    const amount = roundAmount(
      resolveComponentValue(component, basicSalary, grossSalaryBase),
    );
    if (amount <= 0) continue;
    if (component.isDeduction === 1) continue;
    if (component.kind === "designation") continue;
    if (component.kind === "commission") {
      commissionTotal += amount;
      if (isComponentTaxable(component)) taxableCommissionTotal += amount;
      continue;
    }
    if (isComponentTaxable(component)) taxableRecurringComponentTotal += amount;
  }

  const additionalBonus = Math.max(0, roundAmount(Number(payslip.bonus) - commissionTotal));
  return roundAmount(
    computePakistanMonthlySalaryTax(
      basicSalary +
        defaultAllowances +
        taxableRecurringComponentTotal +
        taxableCommissionTotal +
        additionalBonus,
      payslip.month,
      payslip.year,
    ),
  );
}

function computeProjectedPayrollTax(
  basicSalary: number,
  defaultAllowances: number,
  month: number,
  year: number,
  components: Array<typeof salaryComponentsTable.$inferSelect>,
) {
  const grossSalaryBase = basicSalary + defaultAllowances;
  let taxableCommissionTotal = 0;
  let taxableRecurringComponentTotal = 0;

  for (const component of components) {
    const amount = roundAmount(
      resolveComponentValue(component, basicSalary, grossSalaryBase),
    );
    if (amount <= 0) continue;
    if (component.isDeduction === 1) continue;
    if (component.kind === "designation") continue;
    if (component.kind === "commission") {
      if (isComponentTaxable(component)) taxableCommissionTotal += amount;
      continue;
    }
    if (isComponentTaxable(component)) taxableRecurringComponentTotal += amount;
  }

  return roundAmount(
    computePakistanMonthlySalaryTax(
      basicSalary +
        defaultAllowances +
        taxableRecurringComponentTotal +
        taxableCommissionTotal,
      month,
      year,
    ),
  );
}

router.get(
  "/views/monthly",
  requireAuth(["admin", "hr"]),
  async (req, res): Promise<void> => {
    const month = Number(req.query["month"]);
    const year = Number(req.query["year"]);
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 2000 ||
      year > 2100
    ) {
      res.status(400).json({ message: "month and year query params are required" });
      return;
    }

    const settings = await getSettings();
    const { start, end, endDate, daysInMonth } = getMonthRange(year, month);
    const weeklyOffDays = new Set(settings.weeklyOffDays ?? [0, 6]);
    const todayIso = new Date().toISOString().slice(0, 10);

    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayDate = new Date(Date.UTC(year, month - 1, day));
      return {
        date,
        dayNumber: day,
        dayName: dayDate.toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "UTC",
        }),
        isOffDay: weeklyOffDays.has(dayDate.getUTCDay()),
        isFuture: date > todayIso,
      };
    });
    const totalOffDays = days.filter((day) => day.isOffDay).length;

    const [employees, attendance, leaves, payslips, components, incrementEvents] =
      await Promise.all([
        db.select().from(employeesTable).orderBy(asc(employeesTable.joiningDate)),
        db
          .select()
          .from(attendanceTable)
          .where(and(gte(attendanceTable.date, start), lte(attendanceTable.date, end))),
        db
          .select()
          .from(leaveRequestsTable)
          .where(
            and(
              eq(leaveRequestsTable.status, "approved"),
              lte(leaveRequestsTable.startDate, end),
              gte(leaveRequestsTable.endDate, start),
            ),
          ),
        db
          .select()
          .from(payslipsTable)
          .where(and(eq(payslipsTable.month, month), eq(payslipsTable.year, year))),
        db.select().from(salaryComponentsTable),
        db
          .select()
          .from(salaryEventsTable)
          .where(eq(salaryEventsTable.type, "increment")),
      ]);

    const attendanceByEmployee = new Map<
      number,
      Map<string, typeof attendanceTable.$inferSelect>
    >();
    for (const record of attendance) {
      const employeeMap =
        attendanceByEmployee.get(record.employeeId) ?? new Map<string, typeof attendanceTable.$inferSelect>();
      employeeMap.set(record.date, record);
      attendanceByEmployee.set(record.employeeId, employeeMap);
    }

    const leaveTypeByEmployeeDate = new Map<
      number,
      Map<string, "annual" | "casual" | "sick">
    >();
    for (const leave of leaves) {
      const employeeMap =
        leaveTypeByEmployeeDate.get(leave.employeeId) ??
        new Map<string, "annual" | "casual" | "sick">();
      const overlapStart = leave.startDate > start ? leave.startDate : start;
      const overlapEnd = leave.endDate < end ? leave.endDate : end;
      for (const date of eachDateInclusive(overlapStart, overlapEnd)) {
        employeeMap.set(date, leave.type);
      }
      leaveTypeByEmployeeDate.set(leave.employeeId, employeeMap);
    }

    const payslipByEmployee = new Map(
      payslips.map((payslip) => [payslip.employeeId, payslip] as const),
    );
    const componentsByEmployee = new Map<
      number,
      Array<typeof salaryComponentsTable.$inferSelect>
    >();
    for (const component of components) {
      const list = componentsByEmployee.get(component.employeeId) ?? [];
      list.push(component);
      componentsByEmployee.set(component.employeeId, list);
    }
    const incrementsByEmployee = new Map<
      number,
      Array<typeof salaryEventsTable.$inferSelect>
    >();
    for (const event of incrementEvents) {
      const list = incrementsByEmployee.get(event.employeeId) ?? [];
      list.push(event);
      incrementsByEmployee.set(event.employeeId, list);
    }

    const attendanceRows = employees.map((employee) => {
      const joiningDate = employee.joiningDate;
      const leftDate = employee.leftDate;
      const probationEndDate = ymd(
        subtractDay(addMonths(parseDate(joiningDate), employee.probationMonths)),
      );
      const recordMap = attendanceByEmployee.get(employee.id) ?? new Map();
      const leaveMap = leaveTypeByEmployeeDate.get(employee.id) ?? new Map();
      const summary = {
        annual: 0,
        casual: 0,
        sick: 0,
        absent: 0,
        late: 0,
      };

      const dayCells = days.map((day) => {
        const isBeforeJoining = day.date < joiningDate;
        const isAfterLeaving = Boolean(leftDate && day.date > leftDate);
        if (isBeforeJoining || isAfterLeaving) {
          return {
            date: day.date,
            status: "inactive",
            label: statusCellLabel("inactive"),
            checkInTime: null,
            checkOutTime: null,
            workedMinutes: null,
            excused: false,
            notes: null,
            isOffDay: day.isOffDay,
          };
        }

        if (day.isFuture) {
          return {
            date: day.date,
            status: "future",
            label: "",
            checkInTime: null,
            checkOutTime: null,
            workedMinutes: null,
            excused: false,
            notes: null,
            isOffDay: day.isOffDay,
          };
        }

        const leaveType = leaveMap.get(day.date) ?? null;
        const record = recordMap.get(day.date);
        const normalized = record ? normalizeAttendanceStatus(record, employee) : null;
        let status = normalized?.status ?? record?.status ?? null;

        if (!status && day.isOffDay) status = "off";
        if (!status && leaveType) status = "on_leave";
        if (!status) status = "absent";

        if (leaveType === "annual") summary.annual += 1;
        if (leaveType === "casual") summary.casual += 1;
        if (leaveType === "sick") summary.sick += 1;
        if (status === "absent") summary.absent += 1;
        if (status === "late") summary.late += 1;

        return {
          date: day.date,
          status,
          label: statusCellLabel(status, leaveType),
          checkInTime: record?.checkInTime?.toISOString() ?? null,
          checkOutTime: record?.checkOutTime?.toISOString() ?? null,
          workedMinutes: record?.workedMinutes ?? null,
          excused: record?.excused ?? false,
          notes: record?.notes ?? null,
          isOffDay: day.isOffDay,
        };
      });

      return {
        employeeId: employee.id,
        doj: employee.joiningDate,
        employeeName: employee.name,
        designation: employee.position ?? "",
        probationEndDate,
        employmentStatus:
          employee.leftDate && employee.leftDate <= end ? "left" : "active",
        annualLeaves: summary.annual,
        casualLeaves: summary.casual,
        sickLeaves: summary.sick,
        absentDays: summary.absent,
        lateDays: summary.late,
        totalOffDays,
        dayCells,
      };
    });

    const salaryRows = employees.map((employee) => {
      const payslip = payslipByEmployee.get(employee.id) ?? null;
      const employeeComponents = componentsByEmployee.get(employee.id) ?? [];
      const resolvedCompensation = resolveCompensationForDate(
        employee,
        incrementsByEmployee.get(employee.id) ?? [],
        end,
        settings,
      );
      const basicSalary = payslip
        ? Number(payslip.basicSalary)
        : Number(resolvedCompensation.basicSalary);
      const allowances = payslip
        ? Number(payslip.allowances)
        : Number(resolvedCompensation.allowances);
      const grossSalary = roundAmount(basicSalary + allowances + Number(payslip?.bonus ?? 0));
      const payrollTax = payslip
        ? computePayrollTaxFromPayslip(payslip, employeeComponents)
        : computeProjectedPayrollTax(
            basicSalary,
            allowances,
            month,
            year,
            employeeComponents,
          );

      return {
        employeeId: employee.id,
        doj: employee.joiningDate,
        employeeName: employee.name,
        designation: employee.position ?? "",
        department: employee.department ?? "",
        payrollStatus: payslip ? "generated" : "pending",
        employmentStatus:
          employee.leftDate && employee.leftDate <= end ? "left" : "active",
        basicSalary,
        allowances,
        grossSalary,
        totalWorkingDays: payslip?.totalWorkingDays ?? 0,
        presentDays: payslip?.presentDays ?? 0,
        paidLeaveDays: payslip?.paidLeaveDays ?? 0,
        absentDays: payslip?.absentDays ?? 0,
        lateCount: payslip?.lateCount ?? 0,
        latePenaltyDays: payslip ? Number(payslip.lateAbsenceDays) : 0,
        bonus: payslip ? Number(payslip.bonus) : 0,
        loanDeduction: payslip ? Number(payslip.loanDeduction) : 0,
        otherDeductions: payslip ? Number(payslip.otherDeductions) : 0,
        payrollTax,
        netSalary: payslip ? Number(payslip.netSalary) : grossSalary,
        generatedAt: payslip?.generatedAt.toISOString() ?? null,
      };
    });

    res.json({
      month,
      year,
      days,
      attendance: {
        totalOffDays,
        rows: attendanceRows,
      },
      salary: {
        rows: salaryRows,
      },
    });
  },
);

export default router;
