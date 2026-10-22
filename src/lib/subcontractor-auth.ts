import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseMissingColumnFromError } from "@/lib/form-payload-utils";

const SUBCONTRACTOR_ID_COLUMNS = ["user_id", "auth_user_id"] as const;
const SUBCONTRACTOR_EMAIL_COLUMNS = ["email", "contact_email"] as const;

type AuthUserRef = Pick<User, "id" | "email"> | { id: string; email?: string | null };

function emailsMatch(left: unknown, right: string): boolean {
  const a = String(left ?? "").trim().toLowerCase();
  return Boolean(a) && a === right;
}

function readId(value: unknown): string | null {
  const id = String(value ?? "").trim();
  return id || null;
}

export function authUserLooksLikeSubcontractor(
  user: Pick<User, "user_metadata"> | { user_metadata?: Record<string, unknown> | null },
  subcontractorId?: string | null
): boolean {
  if (subcontractorId?.trim()) return true;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const blob = [
    meta.role,
    meta.account_type,
    meta.profile_role,
    meta.user_type,
    meta.type,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
  return blob.includes("subcontractor");
}

/** Resolve a subcontractor company record for the signed-in auth user. */
export async function lookupSubcontractorIdForAuthUser(
  client: SupabaseClient,
  user: AuthUserRef
): Promise<string | null> {
  const userId = String(user.id ?? "").trim();
  const email = String(user.email ?? "").trim().toLowerCase();

  if (userId) {
    for (const column of SUBCONTRACTOR_ID_COLUMNS) {
      const id = await lookupByColumn(client, column, userId);
      if (id) return id;
    }
  }

  if (email) {
    for (const column of SUBCONTRACTOR_EMAIL_COLUMNS) {
      const exact = await lookupByColumn(client, column, email);
      if (exact) return exact;

      const { data, error } = await client
        .from("subcontractors")
        .select("id, email, contact_email")
        .ilike(column, email)
        .limit(5);

      if (error) {
        const missing = parseMissingColumnFromError(error.message);
        if (missing === column) continue;
        continue;
      }

      const match = (data ?? []).find(
        (row) =>
          emailsMatch((row as { email?: unknown }).email, email) ||
          emailsMatch((row as { contact_email?: unknown }).contact_email, email)
      );
      const id = readId((match as { id?: unknown } | undefined)?.id);
      if (id) return id;
    }
  }

  return null;
}

async function lookupByColumn(
  client: SupabaseClient,
  column: string,
  value: string
): Promise<string | null> {
  const { data, error } = await client
    .from("subcontractors")
    .select("id")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    return null;
  }

  return readId((data as { id?: unknown } | null)?.id);
}
