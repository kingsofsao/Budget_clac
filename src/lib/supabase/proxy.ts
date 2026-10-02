import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Refresh the Supabase auth session on every navigation and forward the
 * updated cookies to both the page render and the browser.
 *
 * `extraRequestHeaders` (e.g. the CSP nonce) are passed through to the render.
 */
export async function updateSession(request: NextRequest, extraRequestHeaders?: Headers) {
  const forwardHeaders = () => {
    const headers = new Headers(request.headers);
    extraRequestHeaders?.forEach((value, key) => headers.set(key, value));
    return headers;
  };
  let response = NextResponse.next({ request: { headers: forwardHeaders() } });
  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Updating request.cookies also rewrites request.headers' cookie line,
        // so the page render sees the refreshed session.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: forwardHeaders() } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });
  // Do not run code between createServerClient and getClaims().
  await supabase.auth.getClaims();
  return response;
}
