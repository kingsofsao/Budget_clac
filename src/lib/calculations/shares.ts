import { assertPaise, splitEqual, validateSplit, type Paise, formatINR } from "@/lib/money";
import type { ExpenseShare } from "@/types/domain";

export class SplitError extends Error {
  override name = "SplitError";
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
    };

/**
 * Compute each participant's share of a single expense.
 *
 * - `equal`: amount / n; the remainder paise go to the first participants in the
 *   given order. Callers pass participants in stable trip-member order (see
 *   `orderByMembers`), so the same people always absorb the extra paisa.
 * - `custom`: the provided shares are used as-is but must sum to the amount exactly.
 *
 * Zero shares are permitted in custom input (someone was ticked but owes nothing);
 * they are dropped from the result so they do not count as participants.
 */
export function calculateExpenseShares(input: SplitInput): ExpenseShare[] {
  assertPaise(input.amountPaise, "Expense amount");
  if (input.amountPaise <= 0) throw new SplitError("Amount must be greater than zero.");

  if (input.method === "equal") {
    const ids = input.participantIds;
    if (ids.length === 0) throw new SplitError("Select at least one participant.");
    if (new Set(ids).size !== ids.length) throw new SplitError("A participant was selected twice.");
    const amounts = splitEqual(input.amountPaise, ids.length);
    return ids.map((memberId, i) => ({ memberId, sharePaise: amounts[i] ?? 0 }));
  }

  const shares = input.shares;
  if (shares.length === 0) throw new SplitError("Select at least one participant.");
  const ids = shares.map((s) => s.memberId);
  if (new Set(ids).size !== ids.length) throw new SplitError("A participant was selected twice.");
  for (const s of shares) {
    assertPaise(s.sharePaise, "Share");
    if (s.sharePaise < 0) throw new SplitError("Shares cannot be negative.");
  }
  const check = validateSplit(
    input.amountPaise,
    shares.map((s) => s.sharePaise),
  );
  if (!check.valid) {
    throw new SplitError(
      `The participant shares must add up to ${formatINR(input.amountPaise)} (currently ${formatINR(check.total)}).`,
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
