import type { User } from "@supabase/supabase-js";
import { readRequestAccessToken } from "@/lib/auth-access-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Resolve the signed-in user for a profile API request.
 * Native WebViews often send the access token but omit or truncate session cookies,
 * so auth.uid() is empty unless the bearer token is verified first.
 */
export async function resolveRequestAuthUser(req: Request): Promise<User | null> {
  const token = readRequestAccessToken(req);
  if (token) {
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) return data.user;
      if (error) {
        console.warn("[auth] bearer session was rejected", error.message);
      }
    } catch (error) {
      console.warn("[auth] bearer session lookup failed", error);
    }
  }

  try {
    const server = await createSupabaseServerClient();
    const {
      data: { user },
    } = await server.auth.getUser();
    return user;
  } catch (error) {
    console.warn("[auth] cookie session lookup failed", error);
    return null;
  }
}
