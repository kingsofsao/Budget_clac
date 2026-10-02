import { basisPointsToInputString, paiseToInputString } from "@/lib/money";
import type { ExpenseFormValues } from "@/lib/validation";
import type { Expense } from "@/types/domain";

/** Turn a stored expense back into the strings the form edits (used by Edit and Duplicate). */
export function expenseToFormValues(expense: Expense): ExpenseFormValues {
  const splitInputs: Record<string, string> = {};
  for (const s of expense.shares) {
    if (expense.splitMethod === "custom")
      splitInputs[s.memberId] = paiseToInputString(s.sharePaise);
    else if (expense.splitMethod === "shares" && s.splitValue)
      splitInputs[s.memberId] = String(s.splitValue);
    else if (expense.splitMethod === "percentage" && s.splitValue)
      splitInputs[s.memberId] = basisPointsToInputString(s.splitValue);
  }
  return {
    description: expense.description,
    amount: paiseToInputString(expense.amountPaise),
    paidByMemberId: expense.paidByMemberId,
    category: expense.category,
    splitMethod: expense.splitMethod,
    expenseDate: expense.expenseDate,
    notes: expense.notes ?? "",
    participantIds: expense.shares.map((s) => s.memberId),
    splitInputs,
  };
}
