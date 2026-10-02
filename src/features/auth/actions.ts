"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, ok, type ActionResult } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, passwordSchema } from "@/lib/validation";

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Turn an anonymous guest session into a permanent account by attaching an
 * email and password. Trips stay attached because the user id does not change.
 */
export async function saveAccountAction(input: {
  email: string;
  password: string;
}): Promise<ActionResult<{ email: string }>> {
  const email = emailSchema.safeParse(input.email);
  const password = passwordSchema.safeParse(input.password);
  const fieldErrors: Record<string, string> = {};
  if (!email.success) fieldErrors.email = email.error.issues[0]?.message ?? "Invalid email.";
  if (!password.success)
    fieldErrors.password = password.error.issues[0]?.message ?? "Invalid password.";
  if (!email.success || !password.success)
    return fail("Please fix the highlighted fields.", fieldErrors);

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return fail("Please sign in to continue.");
  const { error } = await supabase.auth.updateUser({ email: email.data, password: password.data });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return fail(
      taken ? "That email already has an account. Sign in with it instead." : error.message,
      taken ? { email: "That email already has an account." } : undefined,
    );
  }
  revalidatePath("/", "layout");
  return ok({ email: email.data });
}
