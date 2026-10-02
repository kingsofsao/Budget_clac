import {
  assertPaise,
  formatBasisPoints,
  formatINR,
  splitByWeights,
  splitEqual,
  validateSplit,
  type Paise,
} from "@/lib/money";
import type { ExpenseShare } from "@/types/domain";

export class SplitError extends Error {
  override name = "SplitError";
}

/** Percentages are handled as integer basis points: 100% = 10,000. */
export const FULL_PERCENT_BP = 10_000;

export interface WeightInput {
  memberId: string;
  /** Number of shares (shares split) or basis points (percentage split). */
  value: number;
}

export type SplitInput =
  | {
      method: "equal";
      amountPaise: Paise;
      /** Participant member ids, already in trip member order (see `orderByMembers`). */
      participantIds: readonly string[];
    }
  | {
      method: "custom";
      amountPaise: Paise;
      shares: readonly ExpenseShare[];
    }
  | {
      method: "shares" | "percentage";
      amountPaise: Paise;
      /** In trip member order, so leftover paise go to the same people every time. */
      weights: readonly WeightInput[];
    };

function assertUniqueIds(ids: readonly string[]) {
  if (ids.length === 0) throw new SplitError("Select at least one participant.");
  if (new Set(ids).size !== ids.length) throw new SplitError("A participant was selected twice.");
}

/**
 * Compute each participant's share of a single expense.
 *
 * - `equal`: amount / n; the remainder paise go to the first participants in the
 *   given order. Callers pass participants in stable trip-member order (see
 *   `orderByMembers`), so the same people always absorb the extra paisa.
 * - `custom`: the provided shares are used as-is but must sum to the amount exactly.
 *   Zero shares are dropped so they do not count as participants.
 * - `shares`: proportional to positive whole-number shares (largest remainder
 *   rounding, ties to the earlier participant). 2 shares pay twice as much as 1.
 * - `percentage`: proportional to integer basis points that must total exactly
 *   10,000 (100%). Same rounding as `shares`.
 *
 * Every method returns shares that sum exactly to the amount.
 */
export function calculateExpenseShares(input: SplitInput): ExpenseShare[] {
  assertPaise(input.amountPaise, "Expense amount");
  if (input.amountPaise <= 0) throw new SplitError("Amount must be greater than zero.");

  if (input.method === "equal") {
    const ids = input.participantIds;
    assertUniqueIds(ids);
    const amounts = splitEqual(input.amountPaise, ids.length);
    return ids.map((memberId, i) => ({ memberId, sharePaise: amounts[i] ?? 0 }));
  }

  if (input.method === "custom") return customShares(input.amountPaise, input.shares);

  const weights = input.weights;
  assertUniqueIds(weights.map((w) => w.memberId));
  for (const w of weights) {
    if (!Number.isSafeInteger(w.value) || w.value <= 0) {
      throw new SplitError(
        input.method === "shares"
          ? "Each person needs at least 1 share."
          : "Each person needs a percentage above 0%.",
      );
    }
  }
  if (input.method === "percentage") {
    const total = weights.reduce((s, w) => s + w.value, 0);
    if (total !== FULL_PERCENT_BP) {
      throw new SplitError(
        `Percentages must add up to 100% (currently ${formatBasisPoints(total)}).`,
      );
    }
  }
  const amounts = splitByWeights(
    input.amountPaise,
    weights.map((w) => w.value),
  );
  return weights.map((w, i) => ({
    memberId: w.memberId,
    sharePaise: amounts[i] ?? 0,
    splitValue: w.value,
  }));
}

function customShares(amountPaise: Paise, shares: readonly ExpenseShare[]): ExpenseShare[] {
  assertUniqueIds(shares.map((s) => s.memberId));
  for (const s of shares) {
    assertPaise(s.sharePaise, "Share");
    if (s.sharePaise < 0) throw new SplitError("Shares cannot be negative.");
  }
  const check = validateSplit(
    amountPaise,
    shares.map((s) => s.sharePaise),
  );
  if (!check.valid) {
    throw new SplitError(
      `The participant shares must add up to ${formatINR(amountPaise)} (currently ${formatINR(check.total)}).`,
    );
  }
  const nonZero = shares.filter((s) => s.sharePaise > 0);
  return nonZero.map((s) => ({ memberId: s.memberId, sharePaise: s.sharePaise }));
}

/** Sort member ids by their trip position so rounding is deterministic. */
export function orderByMembers(
  ids: readonly string[],
  members: readonly { id: string; position: number }[],
): string[] {
  const pos = new Map(members.map((m) => [m.id, m.position]));
  return [...ids].sort((a, b) => {
    const pa = pos.get(a) ?? Number.MAX_SAFE_INTEGER;
    const pb = pos.get(b) ?? Number.MAX_SAFE_INTEGER;
    return pa === pb ? (a < b ? -1 : a > b ? 1 : 0) : pa - pb;
  });
}
