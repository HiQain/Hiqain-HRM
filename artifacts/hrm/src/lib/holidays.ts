export type HolidayCountry = "us" | "pk";
export type HolidayFilter = "all" | HolidayCountry;

export type HolidayItem = {
  date: string;
  name: string;
  country: HolidayCountry;
};

export const COMPANY_HOLIDAYS_2026: HolidayItem[] = [
  { date: "2026-01-01", name: "New Year's Day", country: "us" },
  { date: "2026-05-25", name: "Memorial Day", country: "us" },
  { date: "2026-07-03", name: "Independence Day", country: "us" },
  { date: "2026-09-07", name: "Labor Day", country: "us" },
  { date: "2026-11-26", name: "Thanksgiving Day", country: "us" },
  { date: "2026-12-24", name: "Christmas Day", country: "us" },
  { date: "2026-12-25", name: "Christmas Day", country: "us" },
  { date: "2026-12-31", name: "New Year's Eve", country: "us" },
];

export const PAKISTAN_HOLIDAYS_2026: HolidayItem[] = [
  {
    date: "2026-03-21",
    name: "Eid-ul-Fitr - Day 1 (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-03-22",
    name: "Eid-ul-Fitr - Day 2 (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-03-23",
    name: "Eid-ul-Fitr - Day 3 (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-05-27",
    name: "Eid-ul-Adha - Day 1 (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-05-28",
    name: "Eid-ul-Adha - Day 2 (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-05-29",
    name: "Eid-ul-Adha - Day 3 (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-06-24",
    name: "Muharram - 9th Muharram (subject to moon sighting)",
    country: "pk",
  },
  {
    date: "2026-06-25",
    name: "Muharram - 10th Muharram (subject to moon sighting)",
    country: "pk",
  },
];

export function sortHolidays<T extends { date: string; name: string }>(
  holidays: T[],
): T[] {
  return [...holidays].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    return byDate !== 0 ? byDate : a.name.localeCompare(b.name);
  });
}

export function mergeHolidaySets(
  existing: HolidayItem[],
  incoming: HolidayItem[],
): HolidayItem[] {
  const map = new Map<string, HolidayItem>();
  for (const holiday of [...existing, ...incoming]) {
    map.set(`${holiday.country}-${holiday.date}-${holiday.name}`, holiday);
  }
  return sortHolidays(Array.from(map.values()));
}

export function filterHolidays<T extends { country: HolidayCountry }>(
  holidays: T[],
  filter: HolidayFilter,
): T[] {
  if (filter === "all") return holidays;
  return holidays.filter((holiday) => holiday.country === filter);
}

export function getHighlightedHoliday<T extends { date: string }>(holidays: T[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return [...holidays]
    .sort((a, b) => a.date.localeCompare(b.date))
    .find((holiday) => new Date(`${holiday.date}T00:00:00`) >= today);
}

export function getMonthLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}
