import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  canManageAdministration,
  normalizeSecurityRole,
} from "@/lib/security-roles";

export async function requireSwmsAdminAccess() {
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false as const,
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
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createSupabaseAdminClient();
  let workerRow: { security_role?: string } | null = null;

  const authLookup = await admin
    .from("workers")
    .select("id, security_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!authLookup.error && authLookup.data) {
    workerRow = authLookup.data as { security_role?: string };
  } else if (user.email) {
    const emailLookup = await admin
      .from("workers")
      .select("id, security_role")
      .ilike("email", user.email)
      .maybeSingle();
    workerRow = (emailLookup.data as { security_role?: string } | null) ?? null;
  }

  const role = normalizeSecurityRole(workerRow?.security_role);

  if (!canManageAdministration(role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, admin, user };
}

export async function requireAuthenticatedWorkerAccess() {
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false as const,
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
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createSupabaseAdminClient();
  const authLookup = await admin
    .from("workers")
    .select("id, security_role, first_name, last_name, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let worker = authLookup.data as
    | {
        id: string;
        security_role?: string | null;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
      }
    | null;

  if (!worker?.id && user.email) {
    const emailLookup = await admin
      .from("workers")
      .select("id, security_role, first_name, last_name, full_name")
      .ilike("email", user.email)
      .maybeSingle();
    worker = emailLookup.data as typeof worker;
  }

  if (!worker?.id) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Worker profile not found for this account." },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, admin, user, workerId: worker.id, worker };
}
