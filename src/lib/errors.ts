/** Result type returned by every server action. Never throw across the action boundary. */
export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const GENERIC_ERROR = "Something went wrong. Please try again.";

interface MaybePostgrestError {
  code?: string;
  message?: string;
}

/**
 * Convert a Supabase/PostgREST error into a message safe to show users.
 * Our database functions raise user-facing messages with SQLSTATE "PTxxx";
 * anything else is an internal error and gets a generic message.
 */
export function userMessage(error: unknown): string {
  const e = error as MaybePostgrestError | null;
  if (e?.code && /^PT\d{3}$/.test(e.code) && e.message) return e.message;
  if (e?.code === "23505") return "That already exists.";
  return GENERIC_ERROR;
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string>,
): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
