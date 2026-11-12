import { addDays, format, getISOWeek, isToday, parseISO, startOfISOWeek } from "date-fns";

export const toISO = (d: Date) => format(d, "yyyy-MM-dd");
export const fromISO = (s: string) => parseISO(s);

export const weekStart = (d: Date) => startOfISOWeek(d);
export const weekDays = (start: Date) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const weekNumber = (d: Date) => getISOWeek(d);
export { addDays, isToday };

// Formatting uses the browser's locale, so German browsers get German day names.
const locale = typeof navigator !== "undefined" ? navigator.language : "en";

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, opts);
const weekdayShort = fmt({ weekday: "short" });
const weekdayLong = fmt({ weekday: "long" });
const dayMonth = fmt({ day: "numeric", month: "short" });
const dayMonthYear = fmt({ day: "numeric", month: "short", year: "numeric" });

export const formatWeekday = (d: Date, long = false) => (long ? weekdayLong : weekdayShort).format(d);
export const formatDayMonth = (d: Date) => dayMonth.format(d);
export const formatDate = (d: Date) => dayMonthYear.format(d);

export function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${dayMonth.format(start)} – ${dayMonthYear.format(end)}`;
}

const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

export function formatRelativeDay(iso: string) {
  const diff = Math.round((fromISO(iso).getTime() - fromISO(toISO(new Date())).getTime()) / 86_400_000);
  if (Math.abs(diff) < 7) return relative.format(diff, "day");
  if (Math.abs(diff) < 60) return relative.format(Math.round(diff / 7), "week");
  return relative.format(Math.round(diff / 30), "month");
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
