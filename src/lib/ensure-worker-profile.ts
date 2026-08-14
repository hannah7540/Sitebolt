import type { SupabaseClient, User } from "@supabase/supabase-js";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import { findWorkerIdForAuthUser } from "@/lib/worker-onboarding";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { buildWorkerNameFields, splitWorkerFullName } from "@/lib/worker-utils";

function readUserFullName(user: User): string {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.full_name === "string" && metadata.full_name.trim()) {
    return metadata.full_name.trim();
  }
  if (typeof metadata?.name === "string" && metadata.name.trim()) {
    return metadata.name.trim();
  }
  return "";
}

async function upsertProfileRow(
  admin: SupabaseClient,
  options: {
    authUserId: string;
    email: string;
    fullName: string;
    workerId: string;
    role?: string | null;
  }
): Promise<void> {
  await admin.from("profiles").upsert(
    [
      {
        id: options.authUserId,
        email: options.email,
        full_name: options.fullName,
        role: options.role ?? DEFAULT_WORKER_SECURITY_ROLE,
        worker_id: options.workerId,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: "id" }
  );
}

export async function ensureWorkerProfileForAuthUser(
  admin: SupabaseClient,
  user: User
): Promise<{ workerId: string | null; error: string | null }> {
  const email = user.email?.trim();
  if (!email) {
    return { workerId: null, error: "Auth user email is required." };
  }

  const fullNameFromUser = readUserFullName(user);
  const fallbackName = email.split("@")[0] ?? "Worker";
  const { firstName, lastName } = splitWorkerFullName(
    fullNameFromUser || fallbackName
  );
  const nameFields = buildWorkerNameFields(firstName, lastName || "Worker");

  const { data: profile } = await admin
    .from("profiles")
    .select("worker_id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.worker_id) {
    await admin
      .from("workers")
      .update({
        auth_user_id: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.worker_id);

    await upsertProfileRow(admin, {
      authUserId: user.id,
      email,
      fullName: profile.full_name?.trim() || nameFields.full_name,
      workerId: profile.worker_id as string,
      role: typeof profile.role === "string" ? profile.role : null,
    });

    return { workerId: profile.worker_id as string, error: null };
  }

  let workerId = await findWorkerIdForAuthUser(admin, user.id, email);

  if (workerId) {
    const linkResult = await linkWorkerAuthAccount(admin, {
      workerId,
      authUserId: user.id,
      email,
      fullName: nameFields.full_name,
      securityRole: DEFAULT_WORKER_SECURITY_ROLE,
    });

    if (linkResult.error) {
      return { workerId: null, error: linkResult.error };
    }

    return { workerId, error: null };
  }

  const insertPayload: Record<string, unknown> = {
    ...nameFields,
    email,
    auth_user_id: user.id,
    security_role: DEFAULT_WORKER_SECURITY_ROLE,
    status: "pending_induction",
    onboarding_completed: false,
  };

  const { data: inserted, error: insertError } = await admin
    .from("workers")
    .insert([insertPayload])
    .select("id, security_role")
    .single();

  if (insertError) {
    workerId = await findWorkerIdForAuthUser(admin, user.id, email);
    if (workerId) {
      const linkResult = await linkWorkerAuthAccount(admin, {
        workerId,
        authUserId: user.id,
        email,
        fullName: nameFields.full_name,
        securityRole: DEFAULT_WORKER_SECURITY_ROLE,
      });

      if (linkResult.error) {
        return { workerId: null, error: linkResult.error };
      }

      return { workerId, error: null };
    }

    return { workerId: null, error: insertError.message };
  }

  workerId = inserted.id as string;
  const securityRole =
    inserted && typeof inserted.security_role === "string"
      ? inserted.security_role
      : DEFAULT_WORKER_SECURITY_ROLE;

  const linkResult = await linkWorkerAuthAccount(admin, {
    workerId,
    authUserId: user.id,
    email,
    fullName: nameFields.full_name,
    securityRole,
  });

  if (linkResult.error) {
    await upsertProfileRow(admin, {
      authUserId: user.id,
      email,
      fullName: nameFields.full_name,
      workerId,
      role: securityRole,
    });
  }

  return { workerId, error: null };
}
