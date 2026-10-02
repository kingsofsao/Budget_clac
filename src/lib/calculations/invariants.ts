import type { Expense } from "@/types/domain";
import type { MemberBalance } from "./balances";
import type { SettlementTransfer } from "./settlements";

/**
 * The five accounting rules that must always hold. Returns human-readable
 * violations (empty when everything reconciles). Used by tests and by the
 * Balances page to show a "totals reconcile" confirmation.
 */
export function checkAccountingInvariants(
  expenses: readonly Pick<Expense, "amountPaise" | "shares">[],
  balances: readonly MemberBalance[],
  settlements: readonly SettlementTransfer[],
): string[] {
  const violations: string[] = [];
  const tripTotal = expenses.reduce((s, e) => s + e.amountPaise, 0);

  // Rule 1: total paid by everyone = total trip expenses.
  const totalPaid = balances.reduce((s, b) => s + b.totalPaid, 0);
  if (totalPaid !== tripTotal) violations.push(`Total paid ${totalPaid} ≠ trip total ${tripTotal}`);

  // Rule 2: total of all shares = total trip expenses (checked per expense too).
  const totalShares = balances.reduce((s, b) => s + b.totalShare, 0);
  if (totalShares !== tripTotal) {
    violations.push(`Total shares ${totalShares} ≠ trip total ${tripTotal}`);
  }
  for (const e of expenses) {
    const sum = e.shares.reduce((s, x) => s + x.sharePaise, 0);
    if (sum !== e.amountPaise) {
      violations.push(`Expense shares sum to ${sum} but the amount is ${e.amountPaise}`);
    }
  }

  // Rule 3: net balances sum to zero.
  const netSum = balances.reduce((s, b) => s + b.net, 0);
  if (netSum !== 0) violations.push(`Net balances sum to ${netSum}, expected 0`);

  // Rule 4: total "should receive" = total "should pay".
  const receive = balances.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);
  const pay = balances.filter((b) => b.net < 0).reduce((s, b) => s - b.net, 0);
  if (receive !== pay) violations.push(`Should receive ${receive} ≠ should pay ${pay}`);

  // Rule 5: applying the settlement transfers brings every balance to zero.
  const after = new Map(balances.map((b) => [b.memberId, b.net]));
  for (const t of settlements) {
    if (!Number.isSafeInteger(t.amountPaise) || t.amountPaise <= 0) {
      violations.push(`Invalid transfer amount ${t.amountPaise}`);
    }
    after.set(t.fromMemberId, (after.get(t.fromMemberId) ?? 0) + t.amountPaise);
    after.set(t.toMemberId, (after.get(t.toMemberId) ?? 0) - t.amountPaise);
  }
  for (const [memberId, value] of after) {
    if (value !== 0) violations.push(`Member ${memberId} is left with ${value} after settlement`);
  }
  return violations;
}
