import { SITEBOLT_ACCESS_TOKEN_HEADER } from "@/lib/auth-access-token";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Headers that carry the Supabase session into profile API routes from a WebView. */
export async function browserAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (typeof window === "undefined") return headers;

  const supabase = createSupabaseBrowserClient();
  let token = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token?.trim() ?? "";
    if (token) break;
    await new Promise((resolve) => window.setTimeout(resolve, 70 * (attempt + 1)));
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers[SITEBOLT_ACCESS_TOKEN_HEADER] = token;
  }

  return headers;
}
