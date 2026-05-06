export type HolidayCountry = "us" | "pk" | "other";
export type HolidayFilter = "all" | HolidayCountry;

export type HolidayItem = {
  date: string;
  name: string;
  country: HolidayCountry;
};

export function getHolidayYear(date: string): number {
  return Number(date.slice(0, 4));
}

export function getCurrentHolidayYear(): number {
  return new Date().getFullYear();
}

export function filterHolidaysByYear<T extends { date: string }>(
  holidays: T[],
  year = getCurrentHolidayYear(),
): T[] {
  return holidays.filter((holiday) => getHolidayYear(holiday.date) === year);
}

export function normalizeHolidayCountry(
  country: string | undefined,
  name: string,
): HolidayCountry {
  if (country === "us" || country === "pk" || country === "other") {
    return country;
  }

  return /eid|muharram|ashura|ramadan|iqbal|jinnah|pakistan|kashmir/i.test(name)
    ? "pk"
    : "other";
}

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
