import type { ISODate } from "@/types/domain";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse "YYYY-MM-DD" as a UTC midnight timestamp. Returns null for invalid dates (e.g. 2026-02-30). */
function toUTC(date: ISODate): Date | null {
  if (!ISO_DATE_RE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const value = new Date(Date.UTC(y, m - 1, d));
  if (value.getUTCFullYear() !== y || value.getUTCMonth() !== m - 1 || value.getUTCDate() !== d) {
    return null;
  }
  return value;
}

export function isValidISODate(date: string): date is ISODate {
  return toUTC(date) !== null;
}

function fromUTC(value: Date): ISODate {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const value = toUTC(date);
  if (!value) throw new Error(`Invalid date: ${date}`);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUTC(value);
}

/** Inclusive number of calendar days between two dates (same day → 1). */
export function dayCount(start: ISODate, end: ISODate): number {
  const a = toUTC(start);
  const b = toUTC(end);
  if (!a || !b) throw new Error("Invalid date range");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

/** Every date from start to end inclusive. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const n = dayCount(start, end);
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}

export function isWithin(date: ISODate, start: ISODate, end: ISODate): boolean {
  // ISO dates compare correctly as strings.
  return date >= start && date <= end;
}

/** "01 Oct" */
export function formatShortDate(date: ISODate): string {
  const value = toUTC(date);
  if (!value) return date;
  return `${String(value.getUTCDate()).padStart(2, "0")} ${MONTHS[value.getUTCMonth()]}`;
}

/** "Thu, 01 Oct 2026" */
export function formatLongDate(date: ISODate): string {
  const value = toUTC(date);
  if (!value) return date;
  return `${WEEKDAYS[value.getUTCDay()]}, ${formatShortDate(date)} ${value.getUTCFullYear()}`;
}

/** "01 Oct – 03 Oct" or "01 Oct" for a one-day outing. Adds the year when it differs. */
export function formatDateRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatShortDate(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const left = sameYear ? formatShortDate(start) : `${formatShortDate(start)} ${start.slice(0, 4)}`;
  const right = sameYear ? formatShortDate(end) : `${formatShortDate(end)} ${end.slice(0, 4)}`;
  return `${left} – ${right}`;
}

/** Today's date in India, as most users are there; used only for form defaults. */
export function todayInIndia(): ISODate {
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  return now.toISOString().slice(0, 10);
}

/** Clamp a date into a range (used to default new expenses to a sensible day). */
export function clampDate(date: ISODate, start: ISODate, end: ISODate): ISODate {
  if (date < start) return start;
  if (date > end) return end;
  return date;
}

/** Relative time like "5 min ago", for activity feeds. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return formatShortDate(new Date(iso).toISOString().slice(0, 10));
}

/** "02 Oct 2026, 14:05" in IST, for created/updated timestamps. */
export function formatTimestamp(iso: string): string {
  const value = new Date(new Date(iso).getTime() + 5.5 * 3_600_000);
  const date = value.toISOString().slice(0, 10);
  const time = value.toISOString().slice(11, 16);
  return `${formatShortDate(date)} ${date.slice(0, 4)}, ${time} IST`;
}
