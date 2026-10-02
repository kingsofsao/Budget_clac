import { CATEGORY_IDS, type CategoryId } from "@/lib/categories";
import { eachDay } from "@/lib/dates";
import { splitByWeights, type Paise } from "@/lib/money";
import type { Expense, ISODate } from "@/types/domain";

/**
 * Convert amounts into whole-number percentages that always add up to exactly
 * 100 (largest remainder method), so a breakdown never reads "33% + 33% + 33%".
 * All-zero input yields all zeros.
 */
export function wholePercentages(values: readonly Paise[]): number[] {
  const positive = values.map((v) => Math.max(0, v));
  const indexes = positive.flatMap((v, i) => (v > 0 ? [i] : []));
  const result = values.map(() => 0);
  if (indexes.length === 0) return result;
  // Splitting 100 percentage points with the amounts as weights is exactly
  // the largest remainder method, with deterministic tie-breaking.
  const parts = splitByWeights(
    100,
    indexes.map((i) => positive[i]!),
  );
  indexes.forEach((i, k) => (result[i] = parts[k] ?? 0));
  return result;
}

export interface CategoryTotal {
  category: CategoryId;
  totalPaise: Paise;
  count: number;
  percent: number;
}

/** Totals per category, largest first. Categories with no spending are omitted. */
export function calculateCategorySummary(
  expenses: readonly Pick<Expense, "category" | "amountPaise">[],
): CategoryTotal[] {
  const totals = new Map<CategoryId, { total: number; count: number }>();
  for (const e of expenses) {
    const entry = totals.get(e.category) ?? { total: 0, count: 0 };
    entry.total += e.amountPaise;
    entry.count += 1;
    totals.set(e.category, entry);
  }
  const rows: CategoryTotal[] = CATEGORY_IDS.flatMap((category) => {
    const t = totals.get(category);
    return t ? [{ category, totalPaise: t.total, count: t.count, percent: 0 }] : [];
  });
  const percents = wholePercentages(rows.map((r) => r.totalPaise));
  rows.forEach((r, i) => (r.percent = percents[i] ?? 0));
  return rows.sort(
    (a, b) =>
      b.totalPaise - a.totalPaise ||
      CATEGORY_IDS.indexOf(a.category) - CATEGORY_IDS.indexOf(b.category),
  );
}

export interface DayTotal {
  date: ISODate;
  /** 1-based day of the trip; 0 for a date outside the trip range. */
  dayNumber: number;
  totalPaise: Paise;
  count: number;
}

/**
 * Totals for every day of the trip (including days with no spending), plus any
 * out-of-range dates that have expenses, all in date order.
 */
export function calculateDailySummary(
  expenses: readonly Pick<Expense, "expenseDate" | "amountPaise">[],
  startDate: ISODate,
  endDate: ISODate,
): DayTotal[] {
  const byDate = new Map<ISODate, DayTotal>(
    eachDay(startDate, endDate).map((date, i) => [
      date,
      { date, dayNumber: i + 1, totalPaise: 0, count: 0 },
    ]),
  );
  for (const e of expenses) {
    let entry = byDate.get(e.expenseDate);
    if (!entry) {
      entry = { date: e.expenseDate, dayNumber: 0, totalPaise: 0, count: 0 };
      byDate.set(e.expenseDate, entry);
    }
    entry.totalPaise += e.amountPaise;
    entry.count += 1;
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface TripTotals {
  totalPaise: Paise;
  expenseCount: number;
  memberCount: number;
  /** Mean expense amount, rounded to the nearest paisa (display only). */
  averageExpensePaise: Paise;
  /** Total ÷ number of people, rounded to the nearest paisa (display only). */
  averageSharePaise: Paise;
}

function roundedDivide(total: number, count: number): number {
  return count > 0 ? Math.round(total / count) : 0;
}

export function calculateTripTotals(
  expenses: readonly Pick<Expense, "amountPaise">[],
  memberCount: number,
): TripTotals {
  const totalPaise = expenses.reduce((s, e) => s + e.amountPaise, 0);
  return {
    totalPaise,
    expenseCount: expenses.length,
    memberCount,
    averageExpensePaise: roundedDivide(totalPaise, expenses.length),
    averageSharePaise: roundedDivide(totalPaise, memberCount),
  };
}
