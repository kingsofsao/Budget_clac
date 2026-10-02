import type { Expense, Member, Trip } from "@/types/domain";
import { calculateMemberBalances, type MemberBalance } from "./balances";
import { checkAccountingInvariants } from "./invariants";
import { calculateSettlements, type SettlementTransfer } from "./settlements";
import {
  calculateCategorySummary,
  calculateDailySummary,
  calculateTripTotals,
  type CategoryTotal,
  type DayTotal,
  type TripTotals,
} from "./summary";

export interface TripReport {
  totals: TripTotals;
  balances: MemberBalance[];
  settlements: SettlementTransfer[];
  categories: CategoryTotal[];
  days: DayTotal[];
  /** Sum of all "should receive" balances (= sum of all "should pay"). */
  totalToSettlePaise: number;
  receiverCount: number;
  payerCount: number;
  /** Empty when all five accounting rules hold. */
  invariantViolations: string[];
}

/**
 * Compute every derived figure for a trip in one pass. Pure function of the
 * trip's members and expenses; called on the server for each request.
 */
export function buildTripReport(
  trip: Pick<Trip, "startDate" | "endDate">,
  members: readonly Member[],
  expenses: readonly Expense[],
): TripReport {
  const ordered = [...members].sort((a, b) => a.position - b.position);
  const balances = calculateMemberBalances(ordered, expenses);
  const settlements = calculateSettlements(
    balances,
    ordered.map((m) => m.id),
  );
  const receivers = balances.filter((b) => b.net > 0);
  return {
    totals: calculateTripTotals(expenses, members.length),
    balances,
    settlements,
    categories: calculateCategorySummary(expenses),
    days: calculateDailySummary(expenses, trip.startDate, trip.endDate),
    totalToSettlePaise: receivers.reduce((s, b) => s + b.net, 0),
    receiverCount: receivers.length,
    payerCount: balances.filter((b) => b.net < 0).length,
    invariantViolations: checkAccountingInvariants(expenses, balances, settlements),
  };
}
