import type { Paise } from "@/lib/money";
import type { MemberBalance } from "./balances";

export interface SettlementTransfer {
  fromMemberId: string;
  toMemberId: string;
  amountPaise: Paise;
}

/**
 * Suggest who should pay whom so that every balance reaches zero.
 *
 * Algorithm — greedy largest-debtor / largest-creditor matching:
 *   1. Split members into creditors (net > 0, should receive) and debtors
 *      (net < 0, should pay). Members with a zero balance are ignored.
 *   2. Sort both lists by amount, largest first. Ties are broken by the order
 *      of `tieBreakOrder` (trip member order) and then by member id, so the
 *      output is fully deterministic for the same input.
 *   3. Repeatedly match the largest remaining debtor with the largest remaining
 *      creditor and transfer min(debt, credit). At least one of the two reaches
 *      zero at every step and drops out; the lists are then re-sorted.
 *
 * Guarantees:
 *   - Every transfer is a positive integer number of paise.
 *   - A person only ever pays (debtors) or only ever receives (creditors).
 *   - At most (creditors + debtors − 1) transfers.
 *   - Reconciles every non-zero balance exactly (total paid out = total received).
 *
 * The greedy approach is NOT guaranteed to find the globally minimum number of
 * transfers (that problem is NP-hard in general), but it is the standard
 * practical choice and produces short, easy-to-follow settlement lists.
 *
 * This only computes suggestions. The application never moves money.
 */
export function calculateSettlements(
  balances: readonly Pick<MemberBalance, "memberId" | "net">[],
  tieBreakOrder: readonly string[] = [],
): SettlementTransfer[] {
  const rank = new Map(tieBreakOrder.map((id, i) => [id, i]));
  type Party = { id: string; amount: number };
  const order = (a: Party, b: Party) => {
    if (a.amount !== b.amount) return b.amount - a.amount;
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };

  const creditors: Party[] = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ id: b.memberId, amount: b.net }));
  const debtors: Party[] = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ id: b.memberId, amount: -b.net }));

  const totalCredit = creditors.reduce((s, c) => s + c.amount, 0);
  const totalDebt = debtors.reduce((s, d) => s + d.amount, 0);
  if (totalCredit !== totalDebt) {
    throw new Error(
      `Balances do not reconcile: receivable ${totalCredit} ≠ payable ${totalDebt} (paise)`,
    );
  }

  const transfers: SettlementTransfer[] = [];
  creditors.sort(order);
  debtors.sort(order);
  while (creditors.length > 0 && debtors.length > 0) {
    const creditor = creditors[0]!;
    const debtor = debtors[0]!;
    const amount = Math.min(creditor.amount, debtor.amount);
    transfers.push({ fromMemberId: debtor.id, toMemberId: creditor.id, amountPaise: amount });
    creditor.amount -= amount;
    debtor.amount -= amount;
    if (creditor.amount === 0) creditors.shift();
    if (debtor.amount === 0) debtors.shift();
    creditors.sort(order);
    debtors.sort(order);
  }
  return transfers;
}
