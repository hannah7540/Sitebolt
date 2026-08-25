import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { canAccessEmailsModule, normalizeSecurityRole } from "@/lib/security-roles";

/** SMS hub shares Emails module access (owner / full_access). */
export async function requireSmsApiAccess(): Promise<
  | {
      ok: true;
      admin: ReturnType<typeof createSupabaseAdminClient>;
      workerId: string | null;
      workerName: string | null;
      role: ReturnType<typeof normalizeSecurityRole>;
    }
  | { ok: false; response: NextResponse }
> {
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server admin client is not configured." },
        { status: 503 }
      ),
    };
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: workerRow } = await admin
    .from("workers")
    .select("id, full_name, security_role")
    .eq("email", user.email ?? "")
    .maybeSingle();

  const role = normalizeSecurityRole(
    (workerRow as { security_role?: string } | null)?.security_role
  );

  if (!canAccessEmailsModule(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    admin,
    workerId: workerRow ? String((workerRow as { id: string }).id) : null,
    workerName: workerRow
      ? String((workerRow as { full_name?: string }).full_name ?? "Owner")
      : null,
    role,
  };
}
