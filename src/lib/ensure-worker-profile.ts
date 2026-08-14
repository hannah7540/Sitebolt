import type { SupabaseClient, User } from "@supabase/supabase-js";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import {
  findWorkerIdForAuthUser,
  type WorkerOnboardingRecord,
} from "@/lib/worker-onboarding";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { buildWorkerNameFields, splitWorkerFullName } from "@/lib/worker-utils";

export interface EnsureWorkerInviteInput {
  email: string;
  workerId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  authUserId?: string | null;
}

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

function resolveInviteNameFields(input: EnsureWorkerInviteInput) {
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";
  const fullName = input.fullName?.trim() ?? "";

  if (firstName || lastName) {
    return buildWorkerNameFields(firstName, lastName || "Worker");
  }

  if (fullName) {
    const parts = splitWorkerFullName(fullName);
    return buildWorkerNameFields(parts.firstName, parts.lastName || "Worker");
  }

  const fallback = input.email.split("@")[0] ?? "Worker";
  const parts = splitWorkerFullName(fallback);
  return buildWorkerNameFields(parts.firstName, parts.lastName || "Worker");
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes(column.toLowerCase()) && lower.includes("column");
}

const PENDING_INVITE_STATUSES = new Set(["pending", "invited"]);

export function workerAuthIsActivated(user: User): boolean {
  return Boolean(user.last_sign_in_at || user.email_confirmed_at);
}

/** Flip worker status to active after invite acceptance or auth sign-in. */
export async function markWorkerAccountActivated(
  admin: SupabaseClient,
  workerId: string,
  options: { completeOnboarding?: boolean } = {}
): Promise<{ error: string | null }> {
  const { data: existing } = await admin
    .from("workers")
    .select("status, onboarding_completed")
    .eq("id", workerId)
    .maybeSingle();

  const currentStatus = String(existing?.status ?? "").toLowerCase();
  const alreadyActive =
    currentStatus === "active" &&
    (!options.completeOnboarding || existing?.onboarding_completed === true);

  if (alreadyActive) {
    return { error: null };
  }

  if (
    !options.completeOnboarding &&
    !PENDING_INVITE_STATUSES.has(currentStatus) &&
    currentStatus !== "pending_induction" &&
    currentStatus !== ""
  ) {
    return { error: null };
  }

  const payload: Record<string, unknown> = {
    status: "active",
    updated_at: new Date().toISOString(),
  };

  if (options.completeOnboarding) {
    payload.onboarding_completed = true;
  }

  let { error } = await admin.from("workers").update(payload).eq("id", workerId);

  if (
    error &&
    options.completeOnboarding &&
    isMissingColumnError(error.message, "onboarding_completed")
  ) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.onboarding_completed;
    ({ error } = await admin.from("workers").update(fallbackPayload).eq("id", workerId));
  }

  return { error: error?.message ?? null };
}

export async function syncWorkerStatusFromAuthUser(
  admin: SupabaseClient,
  user: User,
  workerId: string
): Promise<{ synced: boolean; error: string | null }> {
  if (!workerAuthIsActivated(user)) {
    return { synced: false, error: null };
  }

  const result = await markWorkerAccountActivated(admin, workerId, {
    completeOnboarding: false,
  });

  return { synced: !result.error, error: result.error };
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
  const { error } = await admin.from("profiles").upsert(
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

  if (error) {
    console.warn("upsertProfileRow:", error.message);
  }
}

async function findWorkerIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("workers")
    .select("id")
    .ilike("email", email.trim())
    .limit(1);

  if (error || !data?.length) return null;
  return data[0]?.id as string;
}

async function insertWorkerRow(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ workerId: string | null; error: string | null }> {
  const attempts: Record<string, unknown>[] = [payload];

  if ("onboarding_completed" in payload) {
    const withoutOnboarding = { ...payload };
    delete withoutOnboarding.onboarding_completed;
    attempts.push(withoutOnboarding);
  }

  for (const attempt of attempts) {
    const { data, error } = await admin
      .from("workers")
      .insert([attempt])
      .select("id, security_role")
      .maybeSingle();

    if (!error && data?.id) {
      return { workerId: data.id as string, error: null };
    }

    if (error && attempts.indexOf(attempt) < attempts.length - 1) {
      continue;
    }

    if (error) {
      return { workerId: null, error: error.message };
    }
  }

  return { workerId: null, error: "Failed to create worker profile." };
}

export async function ensureWorkerInviteRecord(
  admin: SupabaseClient,
  input: EnsureWorkerInviteInput
): Promise<{ workerId: string | null; error: string | null }> {
  const email = input.email.trim();
  if (!email) {
    return { workerId: null, error: "Email is required." };
  }

  const nameFields = resolveInviteNameFields(input);
  const authUserId = input.authUserId?.trim() || null;

  if (input.workerId?.trim()) {
    const workerId = input.workerId.trim();
    const { data: existing } = await admin
      .from("workers")
      .select("id")
      .eq("id", workerId)
      .maybeSingle();

    if (existing?.id) {
      await admin
        .from("workers")
        .update({
          email,
          auth_user_id: authUserId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workerId);

      if (authUserId) {
        await upsertProfileRow(admin, {
          authUserId,
          email,
          fullName: nameFields.full_name,
          workerId,
        });
      }

      return { workerId, error: null };
    }
  }

  let workerId = await findWorkerIdByEmail(admin, email);

  if (workerId) {
    await admin
      .from("workers")
      .update({
        ...nameFields,
        email,
        auth_user_id: authUserId ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workerId);

    if (authUserId) {
      await upsertProfileRow(admin, {
        authUserId,
        email,
        fullName: nameFields.full_name,
        workerId,
      });
    }

    return { workerId, error: null };
  }

  const insertPayload: Record<string, unknown> = {
    ...nameFields,
    email,
    auth_user_id: authUserId,
    security_role: DEFAULT_WORKER_SECURITY_ROLE,
    status: "pending_induction",
    onboarding_completed: false,
  };

  const inserted = await insertWorkerRow(admin, insertPayload);
  if (inserted.workerId && authUserId) {
    await upsertProfileRow(admin, {
      authUserId,
      email,
      fullName: nameFields.full_name,
      workerId: inserted.workerId,
    });
  }

  return inserted;
}

export function buildFallbackOnboardingRecord(
  workerId: string,
  user: User,
  partial?: Partial<WorkerOnboardingRecord>
): WorkerOnboardingRecord {
  const fullName = readUserFullName(user) || user.email?.split("@")[0] || "";
  const parts = splitWorkerFullName(fullName);

  return {
    id: workerId,
    email: partial?.email ?? user.email ?? "",
    full_name: partial?.full_name ?? (fullName || null),
    first_name: partial?.first_name ?? (parts.firstName || null),
    last_name: partial?.last_name ?? (parts.lastName || null),
    phone: partial?.phone ?? null,
    trade: partial?.trade ?? null,
    emergency_contact_name: partial?.emergency_contact_name ?? null,
    emergency_contact_phone: partial?.emergency_contact_phone ?? null,
    white_card_number: partial?.white_card_number ?? null,
    drivers_licence_number: partial?.drivers_licence_number ?? null,
    onboarding_completed: partial?.onboarding_completed ?? false,
  };
}

const WORKER_ONBOARDING_SELECT_VARIANTS = [
  "id, email, full_name, first_name, last_name, phone, trade, emergency_contact_name, emergency_contact_phone, white_card_number, drivers_licence_number, onboarding_completed",
  "id, email, full_name, first_name, last_name, phone, trade, emergency_contact_name, emergency_contact_phone, white_card_number, drivers_licence_number",
  "id, email, full_name, first_name, last_name, phone, trade, emergency_contact_name, emergency_contact_phone",
  "id, email, full_name, phone, trade",
] as const;

export async function loadWorkerForOnboardingRecord(
  admin: SupabaseClient,
  workerId: string
): Promise<WorkerOnboardingRecord | null> {
  for (const select of WORKER_ONBOARDING_SELECT_VARIANTS) {
    const { data, error } = await admin
      .from("workers")
      .select(select)
      .eq("id", workerId)
      .maybeSingle();

    if (error) {
      if (isMissingColumnError(error.message, "onboarding_completed")) continue;
      continue;
    }

    if (!data) return null;

    const row = data as Partial<WorkerOnboardingRecord>;
    return {
      id: row.id as string,
      email: row.email ?? "",
      full_name: row.full_name ?? null,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      phone: row.phone ?? null,
      trade: row.trade ?? null,
      emergency_contact_name: row.emergency_contact_name ?? null,
      emergency_contact_phone: row.emergency_contact_phone ?? null,
      white_card_number: row.white_card_number ?? null,
      drivers_licence_number: row.drivers_licence_number ?? null,
      onboarding_completed: row.onboarding_completed ?? false,
    };
  }

  return null;
}

export async function ensureWorkerProfileForAuthUser(
  admin: SupabaseClient,
  user: User
): Promise<{ workerId: string | null; error: string | null }> {
  const email = user.email?.trim();
  if (!email) {
    return { workerId: null, error: "Auth user email is required." };
  }

  const inviteResult = await ensureWorkerInviteRecord(admin, {
    email,
    authUserId: user.id,
    fullName: readUserFullName(user),
  });

  if (inviteResult.workerId) {
    const linkResult = await linkWorkerAuthAccount(admin, {
      workerId: inviteResult.workerId,
      authUserId: user.id,
      email,
      fullName: readUserFullName(user) || email.split("@")[0] || "Worker",
      securityRole: DEFAULT_WORKER_SECURITY_ROLE,
    });

    if (linkResult.error) {
      await upsertProfileRow(admin, {
        authUserId: user.id,
        email,
        fullName: readUserFullName(user) || email.split("@")[0] || "Worker",
        workerId: inviteResult.workerId,
      });
    }

    return inviteResult;
  }

  let workerId = await findWorkerIdForAuthUser(admin, user.id, email);
  if (workerId) {
    return { workerId, error: null };
  }

  return inviteResult;
}
