import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseAccentTheme, type AccentTheme } from "@/lib/ui-theme";

function isUiThemeColumnMissing(message: string): boolean {
  const lower = (message || "").toLowerCase();
  if (!lower.includes("ui_theme")) return false;
  return (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find") ||
    lower.includes("column")
  );
}

async function resolveSessionWorkerId(): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const byAuth = await supabase
    .from("workers")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!byAuth.error && byAuth.data?.id) return String(byAuth.data.id);

  const email = user.email?.trim();
  if (!email) return null;

  const byEmail = await supabase.from("workers").select("id").ilike("email", email).maybeSingle();
  if (!byEmail.error && byEmail.data?.id) return String(byEmail.data.id);

  return null;
}

/** Optional per-worker column. Never writes company tables or other workers. */
export async function persistWorkerUiTheme(theme: AccentTheme): Promise<void> {
  try {
    const workerId = await resolveSessionWorkerId();
    if (!workerId) return;

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("workers")
      .update({ ui_theme: theme })
      .eq("id", workerId);

    if (error && !isUiThemeColumnMissing(error.message)) {
      console.warn("[ui-theme] failed to save worker preference:", error.message);
    }
  } catch {
    // Preference still lives in localStorage for this browser.
  }
}

export async function readWorkerUiTheme(): Promise<AccentTheme | null> {
  try {
    const workerId = await resolveSessionWorkerId();
    if (!workerId) return null;

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("workers")
      .select("ui_theme")
      .eq("id", workerId)
      .maybeSingle();

    if (error) {
      if (!isUiThemeColumnMissing(error.message)) {
        console.warn("[ui-theme] failed to load worker preference:", error.message);
      }
      return null;
    }

    const value = (data as { ui_theme?: string | null } | null)?.ui_theme;
    return value ? parseAccentTheme(value) : null;
  } catch {
    return null;
  }
}
