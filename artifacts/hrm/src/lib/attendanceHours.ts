export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  return (hours || 0) * 60 + (minutes || 0);
}

export function computeShiftMinutes(
  officeStartTime?: string | null,
  officeEndTime?: string | null,
): number {
  if (!officeStartTime || !officeEndTime) return 0;
  const start = parseTimeToMinutes(officeStartTime);
  const end = parseTimeToMinutes(officeEndTime);
  return end <= start ? 24 * 60 - start + end : end - start;
}

export function computeDailyHours(
  officeStartTime?: string | null,
  officeEndTime?: string | null,
): number {
  return Math.round((computeShiftMinutes(officeStartTime, officeEndTime) / 60) * 100) / 100;
}

export function computeWorkingDaysInRange(
  start: Date,
  end: Date,
  offDays: number[],
  holidayDates: Set<string>,
): number {
  const offDaySet = new Set(offDays);
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  let count = 0;

  while (cursor <= endDate) {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(
      cursor.getDate(),
    ).padStart(2, "0")}`;
    if (!offDaySet.has(cursor.getDay()) && !holidayDates.has(iso)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

export function computeWorkingDaysInMonth(
  year: number,
  monthIndex: number,
  offDays: number[],
  holidayDates: Set<string>,
): number {
  return computeWorkingDaysInRange(
    new Date(year, monthIndex, 1),
    new Date(year, monthIndex + 1, 0),
    offDays,
    holidayDates,
  );
}

export function computeWorkingDaysInWeek(
  anchorDate: Date,
  offDays: number[],
  holidayDates: Set<string>,
): number {
  const start = new Date(anchorDate);
  const diff = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return computeWorkingDaysInRange(start, end, offDays, holidayDates);
}

export function buildScheduledHoursTargets({
  officeStartTime,
  officeEndTime,
  offDays,
  holidayDates,
  month,
  weekAnchorDate = new Date(),
}: {
  officeStartTime?: string | null;
  officeEndTime?: string | null;
  offDays: number[];
  holidayDates: Set<string>;
  month?: string;
  weekAnchorDate?: Date;
}) {
  const daily = computeDailyHours(officeStartTime, officeEndTime);
  const weeklyWorkingDays = computeWorkingDaysInWeek(weekAnchorDate, offDays, holidayDates);
  const weekly = Math.round(daily * weeklyWorkingDays * 100) / 100;

  const targetMonth = month
    ? new Date(`${month}-01T00:00:00`)
    : weekAnchorDate;
  const monthlyWorkingDays = computeWorkingDaysInMonth(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    offDays,
    holidayDates,
  );
  const monthly = Math.round(daily * monthlyWorkingDays * 100) / 100;

  return { daily, weekly, monthly };
}

export function normalizeAttendanceWorkedMinutes({
  status,
  workedMinutes,
  officeStartTime,
  officeEndTime,
}: {
  status: string;
  workedMinutes: number | null | undefined;
  officeStartTime?: string | null;
  officeEndTime?: string | null;
}) {
  if ((workedMinutes ?? 0) > 0) return workedMinutes ?? 0;
  const fullShiftMinutes = computeShiftMinutes(officeStartTime, officeEndTime);
  if (
    status === "present" ||
    status === "late" ||
    status === "remote_work" ||
    status === "on_leave"
  ) {
    return fullShiftMinutes;
  }
  if (status === "half_day") {
    return fullShiftMinutes > 0 ? Math.round(fullShiftMinutes / 2) : 0;
  }
  return workedMinutes ?? 0;
}
