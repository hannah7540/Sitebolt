import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseMissingColumnFromError } from "@/lib/form-payload-utils";

const SUBCONTRACTOR_LOOKUP_COLUMNS = [
  "user_id",
  "auth_user_id",
  "email",
  "contact_email",
] as const;

/** Resolve a subcontractor company record for the signed-in auth user. */
export async function lookupSubcontractorIdForAuthUser(
  client: SupabaseClient,
  user: Pick<User, "id" | "email"> | { id: string; email?: string | null }
): Promise<string | null> {
  const userId = String(user.id ?? "").trim();
  const email = String(user.email ?? "").trim().toLowerCase();
  const lookups: Array<{ column: (typeof SUBCONTRACTOR_LOOKUP_COLUMNS)[number]; value: string }> =
    [];
  if (userId) {
    lookups.push({ column: "user_id", value: userId });
    lookups.push({ column: "auth_user_id", value: userId });
  }
  if (email) {
    lookups.push({ column: "email", value: email });
    lookups.push({ column: "contact_email", value: email });
  }

  for (const lookup of lookups) {
    const { data, error } = await client
      .from("subcontractors")
      .select("id")
      .eq(lookup.column, lookup.value)
      .limit(1)
      .maybeSingle();

    if (error) {
      const missing = parseMissingColumnFromError(error.message);
      if (missing === lookup.column) continue;
      continue;
    }

    const id = data && typeof (data as { id?: unknown }).id === "string"
      ? String((data as { id: string }).id).trim()
      : "";
    if (id) return id;
  }

  return null;
}
