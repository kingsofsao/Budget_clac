import { calculateExpenseShares } from "@/lib/calculations";
import type { CategoryId } from "@/lib/categories";
import type { Expense, Member } from "@/types/domain";

export function makeMembers(names: string[]): Member[] {
  return names.map((name, i) => ({
    id: `m${i + 1}`,
    name,
    email: null,
    color: "#000000",
    userId: null,
    position: i + 1,
  }));
}

let counter = 0;

/** Build an equal-split expense the same way the server does. */
export function equalExpense(
  amountPaise: number,
  paidBy: string,
  participantIds: string[],
  options: { date?: string; category?: CategoryId; description?: string } = {},
): Expense {
  counter += 1;
  return {
    id: `e${counter}`,
    description: options.description ?? `Expense ${counter}`,
    amountPaise,
    paidByMemberId: paidBy,
    category: options.category ?? "other",
    splitMethod: "equal",
    expenseDate: options.date ?? "2026-10-01",
    notes: null,
    createdAt: new Date(2026, 9, 1, 0, 0, counter).toISOString(),
    updatedAt: new Date(2026, 9, 1, 0, 0, counter).toISOString(),
    shares: calculateExpenseShares({ method: "equal", amountPaise, participantIds }),
  };
}

export function customExpense(
  amountPaise: number,
  paidBy: string,
  shares: Record<string, number>,
  options: { date?: string; category?: CategoryId } = {},
): Expense {
  const base = equalExpense(amountPaise, paidBy, [paidBy], options);
  return {
    ...base,
    splitMethod: "custom",
    shares: calculateExpenseShares({
      method: "custom",
      amountPaise,
      shares: Object.entries(shares).map(([memberId, sharePaise]) => ({ memberId, sharePaise })),
    }),
  };
}

/** Small deterministic PRNG (mulberry32) for reproducible randomized tests. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
