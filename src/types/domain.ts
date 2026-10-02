import type { Paise } from "@/lib/money";
import type { CategoryId } from "@/lib/categories";

/** ISO calendar date, "YYYY-MM-DD". Expenses are tracked per day, not per instant. */
export type ISODate = string;

/**
 * Supported split methods. The engine is written so new methods
 * ("percentage", "shares") only need a new branch in `calculateExpenseShares`
 * and a new value in the database check constraint.
 */
export const SPLIT_METHODS = ["equal", "custom"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

export interface Member {
  id: string;
  name: string;
  email: string | null;
  color: string;
  userId: string | null;
  /** Stable ordering used for deterministic rounding (creation order). */
  position: number;
}

export interface ExpenseShare {
  memberId: string;
  sharePaise: Paise;
}

export interface Expense {
  id: string;
  description: string;
  amountPaise: Paise;
  paidByMemberId: string;
  category: CategoryId;
  splitMethod: SplitMethod;
  expenseDate: ISODate;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  shares: ExpenseShare[];
}

export interface Trip {
  id: string;
  code: string;
  name: string;
  description: string | null;
  startDate: ISODate;
  endDate: ISODate;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TripRole = "owner" | "member";
