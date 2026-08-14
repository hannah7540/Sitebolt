export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  ensureWorkerProfileForAuthUser,
  markWorkerAccountActivated,
} from "@/lib/ensure-worker-profile";
import { validatePassword } from "@/lib/password-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { resolveDefaultLandingPathForRole } from "@/lib/user-session";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );
    if (match) return match;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function resolveOrCreateAuthUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
  newPassword: string
): Promise<{ user: User | null; error: string | null }> {
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: newPassword,
      email_confirm: true,
    });

    if (updateError) {
      return { user: null, error: updateError.message };
    }

    const { data, error: fetchError } = await admin.auth.admin.getUserById(existing.id);
    if (fetchError || !data.user) {
      return { user: existing, error: null };
    }

    return { user: data.user, error: null };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: newPassword,
    email_confirm: true,
  });

  if (error || !data.user) {
    return { user: null, error: error?.message ?? "Unable to create auth account." };
  }

  return { user: data.user, error: null };
}

function resolvePostPasswordRedirectPath(
  workerId: string | null,
  securityRole: string | null
): string {
  return resolveDefaultLandingPathForRole(securityRole, workerId);
}

async function activateWorkerAfterPasswordSetup(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: User
): Promise<{ workerId: string | null; securityRole: string | null; error: string | null }> {
  const ensured = await ensureWorkerProfileForAuthUser(admin, user);
  if (ensured.error || !ensured.workerId) {
    return {
      workerId: ensured.workerId,
      securityRole: DEFAULT_WORKER_SECURITY_ROLE,
      error: ensured.error ?? "Worker profile not found.",
    };
  }

  const email = user.email?.trim() ?? "";
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const fullName =
    (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata?.name === "string" && metadata.name.trim()) ||
    email.split("@")[0] ||
    "Worker";

  await linkWorkerAuthAccount(admin, {
    workerId: ensured.workerId,
    authUserId: user.id,
    email,
    fullName,
    securityRole: DEFAULT_WORKER_SECURITY_ROLE,
  });

  const activation = await markWorkerAccountActivated(admin, ensured.workerId, {
    completeOnboarding: true,
  });

  if (activation.error) {
    return {
      workerId: ensured.workerId,
      securityRole: DEFAULT_WORKER_SECURITY_ROLE,
      error: activation.error,
    };
  }

  const { data: workerMeta } = await admin
    .from("workers")
    .select("security_role")
    .eq("id", ensured.workerId)
    .maybeSingle();

  return {
    workerId: ensured.workerId,
    securityRole:
      typeof workerMeta?.security_role === "string"
        ? workerMeta.security_role
        : DEFAULT_WORKER_SECURITY_ROLE,
    error: null,
  };
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { user, error: authError } = await resolveOrCreateAuthUser(
      admin,
      email,
      newPassword
    );

    if (authError || !user) {
      return NextResponse.json(
        { error: authError ?? "Unable to update password." },
        { status: 400 }
      );
    }

    const activation = await activateWorkerAfterPasswordSetup(admin, user);
    if (activation.error) {
      return NextResponse.json({ error: activation.error }, { status: 400 });
    }

    const redirectPath = resolvePostPasswordRedirectPath(
      activation.workerId,
      activation.securityRole
    );

    return NextResponse.json({
      success: true,
      workerId: activation.workerId,
      redirectPath,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
