import "server-only";
import type { ServerSupabase } from "./server";

/**
 * Return the current user id, creating an anonymous guest session if needed.
 * Lets people create or join a trip without signing up; they can attach an
 * email later from the Account page to keep access across devices.
 */
export async function ensureUser(supabase: ServerSupabase): Promise<string> {
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (sub) return sub;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.user) {
    throw new Error(`Could not start a guest session: ${error?.message ?? "unknown error"}`);
  }
  return anon.user.id;
}
