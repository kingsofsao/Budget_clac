import { isCategoryId, type CategoryId } from "@/lib/categories";
import { isValidISODate } from "@/lib/dates";
import { parseINR } from "@/lib/money";
import type { Expense } from "@/types/domain";

export interface ExpenseFilters {
  q: string;
  category: CategoryId | null;
  paidBy: string | null;
  participant: string | null;
  date: string | null;
  minPaise: number | null;
  maxPaise: number | null;
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Parse filters from URL search params, ignoring anything malformed. */
export function parseExpenseFilters(params: Params): ExpenseFilters {
  const category = first(params.category);
  const date = first(params.date);
  const min = parseINR(first(params.min));
  const max = parseINR(first(params.max));
  return {
    q: first(params.q).slice(0, 80),
    category: isCategoryId(category) ? category : null,
    paidBy: first(params.paidBy) || null,
    participant: first(params.participant) || null,
    date: isValidISODate(date) ? date : null,
    minPaise: min,
    maxPaise: max,
  };
}

export function hasActiveFilters(f: ExpenseFilters): boolean {
  return Boolean(
    f.q ||
    f.category ||
    f.paidBy ||
    f.participant ||
    f.date ||
    f.minPaise !== null ||
    f.maxPaise !== null,
  );
}

/** Pure filter used by the Expenses page. Search matches description and notes, case-insensitively. */
export function filterExpenses(expenses: readonly Expense[], f: ExpenseFilters): Expense[] {
  const q = f.q.toLocaleLowerCase();
  return expenses.filter((e) => {
    if (
      q &&
      !e.description.toLocaleLowerCase().includes(q) &&
      !(e.notes ?? "").toLocaleLowerCase().includes(q)
    ) {
      return false;
    }
    if (f.category && e.category !== f.category) return false;
    if (f.paidBy && e.paidByMemberId !== f.paidBy) return false;
    if (f.participant && !e.shares.some((s) => s.memberId === f.participant)) return false;
    if (f.date && e.expenseDate !== f.date) return false;
    if (f.minPaise !== null && e.amountPaise < f.minPaise) return false;
    if (f.maxPaise !== null && e.amountPaise > f.maxPaise) return false;
    return true;
  });
}

/** Group expenses (already sorted newest first) by date, oldest day first for a trip itinerary feel. */
export function groupByDate(
  expenses: readonly Expense[],
): { date: string; expenses: Expense[]; totalPaise: number }[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const list = groups.get(e.expenseDate) ?? [];
    list.push(e);
    groups.set(e.expenseDate, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, list]) => ({
      date,
      expenses: [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      totalPaise: list.reduce((s, e) => s + e.amountPaise, 0),
    }));
}
