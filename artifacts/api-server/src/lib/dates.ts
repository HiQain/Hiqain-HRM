export function parseDate(s: string): Date {
  return new Date(s + (s.length === 10 ? "T00:00:00Z" : ""));
}

export function ymd(d: Date): string {
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${yr}-${mo}-${day}`;
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

export function diffMonths(from: Date, to: Date): number {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function daysBetweenInclusive(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export function workingDaysInMonth(year: number, month: number): number {
  // month is 1-12. Working days = Mon-Sat (typical).
  const date = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (date.getUTCMonth() === month - 1) {
    const dow = date.getUTCDay();
    if (dow !== 0) count += 1; // exclude Sunday
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return count;
}

export function nextOccurrence(month: number, day: number, fromYear: number): Date {
  // month is 1-12
  return new Date(Date.UTC(fromYear, month - 1, day));
}

export function parseHHMM(s: string): { h: number; m: number } {
  const raw = s.trim();

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { h: hours, m: minutes };
    }
  }

  const meridiemMatch = raw.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (meridiemMatch) {
    const parsedHours = Number(meridiemMatch[1]);
    const parsedMinutes = Number(meridiemMatch[2]);
    if (
      parsedHours >= 1 &&
      parsedHours <= 12 &&
      parsedMinutes >= 0 &&
      parsedMinutes <= 59
    ) {
      const meridiem = meridiemMatch[3].toUpperCase();
      const normalizedHours =
        meridiem === "AM"
          ? parsedHours % 12
          : (parsedHours % 12) + 12;
      return { h: normalizedHours, m: parsedMinutes };
    }
  }

  return { h: 0, m: 0 };
}
