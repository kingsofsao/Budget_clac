"use server";

import { revalidatePath } from "next/cache";
import { GENERIC_ERROR, fail, ok, userMessage, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { ensureUser } from "@/lib/supabase/session";
import { createTripSchema, tripCodeSchema, tripDetailsSchema } from "@/lib/validation";
import { getTripByCode } from "./queries";

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}

export async function createTripAction(input: unknown): Promise<ActionResult<{ code: string }>> {
  const parsed = createTripSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please fix the highlighted fields.", fieldErrorsFrom(parsed.error.issues));
  }
  const v = parsed.data;
  const supabase = await createClient();
  try {
    await ensureUser(supabase);
  } catch {
    return fail(GENERIC_ERROR);
  }
  const { data, error } = await supabase.rpc("create_trip", {
    p_name: v.name,
    p_description: v.description ?? "",
    p_start_date: v.startDate,
    p_end_date: v.endDate,
    p_creator_name: v.creatorName,
  });
  const row = data?.[0];
  if (error || !row) return fail(userMessage(error));
  revalidatePath("/");
  return ok({ code: row.public_code });
}

/** Join a trip using its share code (from the join screen). */
export async function joinTripAction(input: {
  code: string;
}): Promise<ActionResult<{ code: string }>> {
  const parsed = tripCodeSchema.safeParse(input.code);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid code.");
  const supabase = await createClient();
  try {
    await ensureUser(supabase);
  } catch {
    return fail(GENERIC_ERROR);
  }
  const { error } = await supabase.rpc("join_trip", { p_code: parsed.data });
  if (error) return fail(userMessage(error));
  revalidatePath("/");
  return ok({ code: parsed.data });
}

/** Open a trip from the home page: validates the code and checks the trip exists. */
export async function openTripAction(input: {
  code: string;
}): Promise<ActionResult<{ code: string }>> {
  const parsed = tripCodeSchema.safeParse(input.code);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid code.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_trip_preview", { p_code: parsed.data });
  if (error) return fail(GENERIC_ERROR);
  if (!data?.length) return fail("No trip found with that code. Check it and try again.");
  return ok({ code: parsed.data });
}

export async function updateTripAction(code: string, input: unknown): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const parsed = tripDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please fix the highlighted fields.", fieldErrorsFrom(parsed.error.issues));
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_trip", {
    p_trip_id: access.trip.id,
    p_name: v.name,
    p_description: v.description ?? "",
    p_start_date: v.startDate,
    p_end_date: v.endDate,
  });
  if (error) return fail(userMessage(error));
  revalidatePath(`/trip/${code}`, "layout");
  return ok(undefined);
}

export async function deleteTripAction(code: string): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_trip", { p_trip_id: access.trip.id });
  if (error) return fail(userMessage(error));
  revalidatePath("/");
  return ok(undefined);
}

/** Owner only: issue a new share code. Old links stop working; members keep access. */
export async function regenerateCodeAction(code: string): Promise<ActionResult<{ code: string }>> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_trip_code", { p_trip_id: access.trip.id });
  if (error || !data) return fail(userMessage(error));
  revalidatePath("/");
  revalidatePath(`/trip/${data}`, "layout");
  return ok({ code: data });
}

/** Members (not the owner) can remove the trip from their account. */
export async function leaveTripAction(code: string): Promise<ActionResult> {
  const access = await getTripByCode(code);
  if (!access) return fail("You don't have access to this trip.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_trip", { p_trip_id: access.trip.id });
  if (error) return fail(userMessage(error));
  revalidatePath("/");
  return ok(undefined);
}
