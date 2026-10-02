"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, userMessage, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { paymentFormSchema, uuidSchema } from "@/lib/validation";
import { getTripByCode } from "@/features/trips/queries";

/**
 * Record that one member paid another outside the app. This is bookkeeping
 * only: nothing is transferred and the app cannot verify it happened.
 */
export async function recordPaymentAction(
  code: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const parsed = paymentFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return fail("Please fix the highlighted fields.", fieldErrors);
  }
  const v = parsed.data;
  if (v.fromMemberId === v.toMemberId) {
    return fail("Please fix the highlighted fields.", {
      toMemberId: "Choose two different people.",
    });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_trip_id: access.trip.id,
    p_from_member_id: v.fromMemberId,
    p_to_member_id: v.toMemberId,
    p_amount_paise: v.amount,
    p_paid_on: v.paidOn,
    p_note: v.note ?? "",
  });
  if (error || !data) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok({ id: data });
}

export async function deletePaymentAction(code: string, paymentId: string): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  if (!uuidSchema.safeParse(paymentId).success) return fail("Invalid payment.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_payment", { p_payment_id: paymentId });
  if (error) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok(undefined);
}
