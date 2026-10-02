"use server";

import { revalidatePath } from "next/cache";
import { fail, ok, userMessage, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { memberSchema, uuidSchema } from "@/lib/validation";
import { getTripByCode } from "@/features/trips/queries";

function parseMember(input: unknown) {
  const parsed = memberSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
  return { ok: false as const, fieldErrors };
}

export async function addMemberAction(
  code: string,
  input: unknown,
  options: { claim?: boolean } = {},
): Promise<ActionResult<{ id: string }>> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const parsed = parseMember(input);
  if (!parsed.ok) return fail("Please fix the highlighted fields.", parsed.fieldErrors);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_member", {
    p_trip_id: access.trip.id,
    p_name: parsed.data.name,
    p_email: parsed.data.email ?? "",
    p_claim: Boolean(options.claim),
  });
  if (error || !data) {
    const message = userMessage(error);
    return fail(message, error?.code === "PT409" ? { name: message } : undefined);
  }
  revalidatePath(`/trip/${code}`, "layout");
  return ok({ id: data });
}

export async function updateMemberAction(
  code: string,
  memberId: string,
  input: unknown,
): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  if (!uuidSchema.safeParse(memberId).success) return fail("Invalid person.");
  const parsed = parseMember(input);
  if (!parsed.ok) return fail("Please fix the highlighted fields.", parsed.fieldErrors);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member", {
    p_member_id: memberId,
    p_name: parsed.data.name,
    p_email: parsed.data.email ?? "",
  });
  if (error) {
    const message = userMessage(error);
    return fail(message, error.code === "PT409" ? { name: message } : undefined);
  }
  revalidatePath(`/trip/${code}`, "layout");
  return ok(undefined);
}

export async function removeMemberAction(code: string, memberId: string): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  if (!uuidSchema.safeParse(memberId).success) return fail("Invalid person.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_member_id: memberId });
  if (error) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok(undefined);
}

/** Link (claim=true) or unlink the signed-in account to a person on the trip. */
export async function claimMemberAction(
  code: string,
  memberId: string,
  claim: boolean,
): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  if (!uuidSchema.safeParse(memberId).success) return fail("Invalid person.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_member", { p_member_id: memberId, p_claim: claim });
  if (error) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok(undefined);
}
