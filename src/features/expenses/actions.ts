"use server";

import { revalidatePath } from "next/cache";
import { SplitError } from "@/lib/calculations";
import { isWithin } from "@/lib/dates";
import { fail, ok, userMessage, type ActionResult } from "@/lib/errors";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { parseExpenseForm, uuidSchema } from "@/lib/validation";
import { getMembers, getTripByCode } from "@/features/trips/queries";
import { sharesForExpense } from "./split";

const FIX_FIELDS = "Please fix the highlighted fields.";

/**
 * Create (expenseId = null) or update an expense.
 *
 * The server re-validates everything and computes the shares itself; figures
 * calculated in the browser are never trusted. The database function then
 * re-checks access, membership and that the shares sum to the amount, and
 * writes the expense with all its shares in a single transaction.
 */
export async function saveExpenseAction(
  code: string,
  expenseId: string | null,
  values: unknown,
): Promise<ActionResult<{ id: string }>> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const { trip } = access;
  if (expenseId !== null && !uuidSchema.safeParse(expenseId).success)
    return fail("Invalid expense.");

  const parsed = parseExpenseForm(values);
  if (!parsed.ok) return fail(FIX_FIELDS, parsed.fieldErrors);
  const e = parsed.data;

  if (!isWithin(e.expenseDate, trip.startDate, trip.endDate)) {
    return fail(FIX_FIELDS, { expenseDate: "The date must be within the trip dates." });
  }

  const members = await getMembers(trip.id);
  const memberIds = new Set(members.map((m) => m.id));
  if (!memberIds.has(e.paidByMemberId)) {
    return fail(FIX_FIELDS, { paidByMemberId: "That person is not on this trip." });
  }
  if (e.participantIds.some((id) => !memberIds.has(id))) {
    return fail(FIX_FIELDS, { participantIds: "A selected participant is not on this trip." });
  }

  let shares;
  try {
    shares = sharesForExpense(e, members);
  } catch (err) {
    if (err instanceof SplitError) return fail(err.message, { splitInputs: err.message });
    throw err;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_expense", {
    p_trip_id: trip.id,
    // The generated types mark every argument non-null; null means "create".
    p_expense_id: expenseId as string,
    p_description: e.description,
    p_amount_paise: e.amountPaise,
    p_paid_by_member_id: e.paidByMemberId,
    p_category: e.category,
    p_split_method: e.splitMethod,
    p_expense_date: e.expenseDate,
    p_notes: e.notes ?? "",
    p_shares: shares.map((s) => ({
      member_id: s.memberId,
      share_paise: s.sharePaise,
      ...(s.splitValue ? { split_value: s.splitValue } : {}),
    })) as Json,
  });
  if (error || !data) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok({ id: data });
}

export async function deleteExpenseAction(code: string, expenseId: string): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  if (!uuidSchema.safeParse(expenseId).success) return fail("Invalid expense.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_expense", { p_expense_id: expenseId });
  if (error) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok(undefined);
}
