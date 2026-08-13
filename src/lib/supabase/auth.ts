import {
  ADMIN_WORKER_ID_KEY,
  WORKER_ID_KEY,
} from "@/lib/user-session";
import { supabase } from "./client";

/** Clears Supabase auth cookies/session and legacy worker selection storage. */
export async function signOutSupabase(): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signOut({ scope: "global" });

  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(WORKER_ID_KEY);
      localStorage.removeItem(ADMIN_WORKER_ID_KEY);
    } catch {
      // Storage may be unavailable in some PWA/native contexts.
    }
  }

  return { error: error ?? null };
}
