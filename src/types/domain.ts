import type { Paise } from "@/lib/money";
import type { CategoryId } from "@/lib/categories";

/** ISO calendar date, "YYYY-MM-DD". Expenses are tracked per day, not per instant. */
export type ISODate = string;

/**
 * Supported split methods:
 *   - equal:      everyone ticked pays the same
 *   - custom:     exact amounts per person
 *   - shares:     proportional to whole-number shares (e.g. a couple = 2)
 *   - percentage: proportional to percentages that add up to 100%
 * A new method needs a branch in `calculateExpenseShares` and a value in the
 * database check constraint.
 */
export const SPLIT_METHODS = ["equal", "custom", "shares", "percentage"] as const;
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
  /** Shares (shares split) or basis points, 1/100 of a percent (percentage split). */
  splitValue?: number | null;
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

/**
 * A payment members recorded by hand ("Gokul paid Surya ₹700").
 * Informational only: the app never processes or verifies payments.
 */
export interface Payment {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  amountPaise: Paise;
  paidOn: ISODate;
  note: string | null;
  createdAt: string;
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
