import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canAccessCommunicationsModule,
  normalizeSecurityRole,
} from "@/lib/security-roles";

export async function requireHeaderNotificationAccess(): Promise<
  | {
      ok: true;
      admin: ReturnType<typeof createSupabaseAdminClient>;
      user: User;
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
    .select("security_role")
    .eq("email", user.email ?? "")
    .maybeSingle();

  const role = normalizeSecurityRole(
    (workerRow as { security_role?: string } | null)?.security_role
  );

  if (!canAccessCommunicationsModule(role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, admin, user };
}
