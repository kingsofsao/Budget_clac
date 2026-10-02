import type { Paise } from "@/lib/money";
import type { Expense, Member, Payment } from "@/types/domain";

export type BalanceStatus = "receive" | "pay" | "settled";

export interface MemberBalance {
  memberId: string;
  /** Sum of every expense this person paid for. */
  totalPaid: Paise;
  /** Sum of this person's allocated share across every expense they took part in. */
  totalShare: Paise;
  /** Recorded payments this person made to others (settling up). */
  paymentsSent: Paise;
  /** Recorded payments this person received from others. */
  paymentsReceived: Paise;
  /**
   * What is still outstanding:
   *   totalPaid − totalShare + paymentsSent − paymentsReceived
   * Positive → should receive; negative → should pay; zero → settled.
   */
  net: Paise;
  status: BalanceStatus;
  expensesPaid: number;
  expensesJoined: number;
}

export function balanceStatus(net: Paise): BalanceStatus {
  return net > 0 ? "receive" : net < 0 ? "pay" : "settled";
}

/**
 * Derive every member's balance from expenses and recorded payments. Balances
 * are never stored; they are always recomputed.
 *
 * A recorded payment from A to B moves A's balance up and B's down by the same
 * amount, so recording the suggested settlement brings everyone to zero.
 *
 * Members referenced by expenses or payments but missing from `members` are
 * still included so totals always reconcile. Output follows `members` order,
 * then any extras.
 */
export function calculateMemberBalances(
  members: readonly Pick<Member, "id">[],
  expenses: readonly Pick<Expense, "amountPaise" | "paidByMemberId" | "shares">[],
  payments: readonly Pick<Payment, "fromMemberId" | "toMemberId" | "amountPaise">[] = [],
): MemberBalance[] {
  const map = new Map<string, MemberBalance>();
  const get = (memberId: string): MemberBalance => {
    let entry = map.get(memberId);
    if (!entry) {
      entry = {
        memberId,
        totalPaid: 0,
        totalShare: 0,
        paymentsSent: 0,
        paymentsReceived: 0,
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

  for (const payment of payments) {
    get(payment.fromMemberId).paymentsSent += payment.amountPaise;
    get(payment.toMemberId).paymentsReceived += payment.amountPaise;
  }

  for (const entry of map.values()) {
    entry.net = entry.totalPaid - entry.totalShare + entry.paymentsSent - entry.paymentsReceived;
    entry.status = balanceStatus(entry.net);
  }
  return [...map.values()];
}
