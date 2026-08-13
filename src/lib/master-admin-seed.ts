/**
 * Master admin bootstrap — restores platform owner access after deploy/reset.
 *
 * Creates or updates:
 *   - Supabase Auth user for the master admin email
 *   - profiles row with role = owner
 *   - workers row linked via auth_user_id + security_role = owner
 */

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase/admin";
import { isSupabaseAdminConfigured } from "./supabase/env";
import { profileRoleToAccountsAccessRole } from "./platform-roles";
import {
  MASTER_ADMIN_EMAIL,
  MASTER_ADMIN_FIRST_NAME,
  MASTER_ADMIN_FULL_NAME,
  MASTER_ADMIN_LAST_NAME,
  MASTER_ADMIN_ROLE,
} from "./master-admin-config";

function parseNameFromEmail(email: string): { firstName: string; lastName: string } {
  const local = email.split("@")[0] ?? "admin";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      firstName: parts[0]!.charAt(0).toUpperCase() + parts[0]!.slice(1),
      lastName: parts[1]!.charAt(0).toUpperCase() + parts[1]!.slice(1),
    };
  }
  return { firstName: MASTER_ADMIN_FIRST_NAME, lastName: MASTER_ADMIN_LAST_NAME };
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<User | null> {
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

async function ensureAuthUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<{ user: User; created: boolean }> {
  const existing = await findAuthUserByEmail(admin, email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        role: MASTER_ADMIN_ROLE,
        full_name: MASTER_ADMIN_FULL_NAME,
      },
      app_metadata: {
        ...existing.app_metadata,
        role: MASTER_ADMIN_ROLE,
      },
    });

    if (error) {
      throw new Error(`Failed to update auth user ${email}: ${error.message}`);
    }

    return { user: data.user, created: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      role: MASTER_ADMIN_ROLE,
      full_name: MASTER_ADMIN_FULL_NAME,
    },
    app_metadata: {
      role: MASTER_ADMIN_ROLE,
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? `Failed to create auth user for ${email}.`);
  }

  return { user: data.user, created: true };
}

async function insertWithVariants(
  supabase: SupabaseClient,
  table: string,
  variants: Record<string, unknown>[],
  select = "id"
): Promise<{ id: string | null; error: string | null }> {
  let lastError: string | null = null;

  for (const variant of variants) {
    const { data, error } = await supabase.from(table).insert([variant]).select(select).single();
    if (!error) return { id: data?.id ? String(data.id) : null, error: null };
    lastError = error.message;
    if (!error.message.toLowerCase().includes("schema cache")) {
      return { id: null, error: error.message };
    }
  }

  return { id: null, error: lastError };
}

async function ensureWorkerRecord(
  supabase: SupabaseClient,
  options: {
    email: string;
    authUserId: string;
    firstName: string;
    lastName: string;
  }
): Promise<string> {
  const accountsRole = profileRoleToAccountsAccessRole(MASTER_ADMIN_ROLE);
  const fullName = `${options.firstName} ${options.lastName}`.trim();

  const { data: existingByAuth } = await supabase
    .from("workers")
    .select("id")
    .eq("auth_user_id", options.authUserId)
    .maybeSingle();

  const { data: existingByEmail } = await supabase
    .from("workers")
    .select("id")
    .eq("email", options.email)
    .maybeSingle();

  const workerId = existingByAuth?.id
    ? String(existingByAuth.id)
    : existingByEmail?.id
      ? String(existingByEmail.id)
      : null;

  const payloadVariants: Record<string, unknown>[] = [
    {
      first_name: options.firstName,
      last_name: options.lastName,
      full_name: fullName,
      email: options.email,
      auth_user_id: options.authUserId,
      security_role: MASTER_ADMIN_ROLE,
      accounts_access_role: accountsRole,
      can_access_accounts: true,
      status: "active",
      state: "NSW",
      trade: "Director",
      updated_at: new Date().toISOString(),
    },
    {
      first_name: options.firstName,
      last_name: options.lastName,
      full_name: fullName,
      email: options.email,
      security_role: MASTER_ADMIN_ROLE,
      status: "active",
      updated_at: new Date().toISOString(),
    },
  ];

  if (workerId) {
    for (const payload of payloadVariants) {
      const { error } = await supabase.from("workers").update(payload).eq("id", workerId);
      if (!error) return workerId;
      if (!error.message.toLowerCase().includes("schema cache")) {
        throw new Error(`Failed to update worker ${options.email}: ${error.message}`);
      }
    }
    return workerId;
  }

  const inserted = await insertWithVariants(supabase, "workers", payloadVariants);
  if (!inserted.id) {
    throw new Error(`Failed to create worker ${options.email}: ${inserted.error}`);
  }

  return inserted.id;
}

async function ensureProfileRecord(
  supabase: SupabaseClient,
  options: {
    authUserId: string;
    email: string;
    fullName: string;
    workerId: string;
  }
): Promise<void> {
  const payload = {
    id: options.authUserId,
    email: options.email,
    full_name: options.fullName,
    role: MASTER_ADMIN_ROLE,
    worker_id: options.workerId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("profiles").upsert([payload], { onConflict: "id" });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("profiles") && message.includes("schema cache")) {
      console.warn(
        "WARN: profiles table not found — run migration 089_user_profiles_platform_roles.sql in Supabase."
      );
      return;
    }
    throw new Error(`Failed to upsert profiles row: ${error.message}`);
  }
}

export async function runMasterAdminSeed(options?: {
  supabase?: SupabaseClient;
  email?: string;
}): Promise<{
  email: string;
  authUserId: string;
  workerId: string;
  createdAuthUser: boolean;
}> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local before running seed:admin."
    );
  }

  const email = (options?.email ?? MASTER_ADMIN_EMAIL).trim().toLowerCase();
  const admin = createSupabaseAdminClient();
  const supabase = options?.supabase ?? admin;
  const name = parseNameFromEmail(email);

  const { user, created: createdAuthUser } = await ensureAuthUser(admin, email);
  const workerId = await ensureWorkerRecord(supabase, {
    email,
    authUserId: user.id,
    firstName: name.firstName || MASTER_ADMIN_FIRST_NAME,
    lastName: name.lastName || MASTER_ADMIN_LAST_NAME,
  });

  await ensureProfileRecord(supabase, {
    authUserId: user.id,
    email,
    fullName: `${name.firstName} ${name.lastName}`.trim(),
    workerId,
  });

  return {
    email,
    authUserId: user.id,
    workerId,
    createdAuthUser,
  };
}
