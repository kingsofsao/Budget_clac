import type { Paise } from "@/lib/money";
import type { Expense, Member } from "@/types/domain";

export type BalanceStatus = "receive" | "pay" | "settled";

export interface MemberBalance {
  memberId: string;
  /** Sum of every expense this person paid for. */
  totalPaid: Paise;
  /** Sum of this person's allocated share across every expense they took part in. */
  totalShare: Paise;
  /** totalPaid − totalShare. Positive → should receive; negative → should pay. */
  net: Paise;
  status: BalanceStatus;
  expensesPaid: number;
  expensesJoined: number;
}

export function balanceStatus(net: Paise): BalanceStatus {
  return net > 0 ? "receive" : net < 0 ? "pay" : "settled";
}

/**
 * Derive every member's balance from the expense list. Balances are never
 * stored; they are always recomputed from expenses and their shares.
 *
 * Members referenced by expenses but missing from `members` are still included
 * so totals always reconcile. Output follows `members` order, then any extras.
 */
export function calculateMemberBalances(
  members: readonly Pick<Member, "id">[],
  expenses: readonly Pick<Expense, "amountPaise" | "paidByMemberId" | "shares">[],
): MemberBalance[] {
  const map = new Map<string, MemberBalance>();
  const get = (memberId: string): MemberBalance => {
    let entry = map.get(memberId);
    if (!entry) {
      entry = {
        memberId,
        totalPaid: 0,
        totalShare: 0,
        net: 0,
        status: "settled",
        expensesPaid: 0,
        expensesJoined: 0,
      };
      map.set(memberId, entry);
    }
    return entry;
  };
  for (const m of members) get(m.id);

  for (const expense of expenses) {
    const payer = get(expense.paidByMemberId);
    payer.totalPaid += expense.amountPaise;
    payer.expensesPaid += 1;
    for (const share of expense.shares) {
      const p = get(share.memberId);
      p.totalShare += share.sharePaise;
      p.expensesJoined += 1;
    }
  }

  for (const entry of map.values()) {
    entry.net = entry.totalPaid - entry.totalShare;
    entry.status = balanceStatus(entry.net);
  }
  return [...map.values()];
}
