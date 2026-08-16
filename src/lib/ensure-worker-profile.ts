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

function mapWorkerRowToOnboardingRecord(
  row: Record<string, unknown>,
  vocs: WorkerOnboardingRecord["vocs"] = []
): WorkerOnboardingRecord {
  return {
    id: row.id as string,
    email: typeof row.email === "string" ? row.email : "",
    full_name: typeof row.full_name === "string" ? row.full_name : null,
    first_name: typeof row.first_name === "string" ? row.first_name : null,
    last_name: typeof row.last_name === "string" ? row.last_name : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    address:
      typeof row.emergency_contact === "string" ? row.emergency_contact : null,
    emergency_contact_name:
      typeof row.emergency_contact_name === "string"
        ? row.emergency_contact_name
        : null,
    emergency_contact_phone:
      typeof row.emergency_contact_phone === "string"
        ? row.emergency_contact_phone
        : null,
    emergency_contact_relationship:
      typeof row.emergency_contact_relationship === "string"
        ? row.emergency_contact_relationship
        : null,
    bank_name: typeof row.bank_name === "string" ? row.bank_name : null,
    bank_bsb: typeof row.bank_bsb === "string" ? row.bank_bsb : null,
    bank_account_number:
      typeof row.bank_account_number === "string"
        ? row.bank_account_number
        : null,
    super_fund: typeof row.super_fund === "string" ? row.super_fund : null,
    super_member_number:
      typeof row.super_member_number === "string" ? row.super_member_number : null,
    super_usi: typeof row.super_usi === "string" ? row.super_usi : null,
    tfn: typeof row.tfn === "string" ? row.tfn : null,
    redundancy_fund_name:
      typeof row.redundancy_fund_name === "string"
        ? row.redundancy_fund_name
        : null,
    redundancy_member_number:
      typeof row.redundancy_member_number === "string"
        ? row.redundancy_member_number
        : null,
    white_card_number:
      typeof row.white_card_number === "string" ? row.white_card_number : null,
    state: typeof row.state === "string" ? row.state : null,
    silica_cert_number:
      typeof row.silica_cert_number === "string" ? row.silica_cert_number : null,
    silica_cert_issue_date:
      typeof row.silica_cert_issue_date === "string"
        ? row.silica_cert_issue_date
        : null,
    drivers_licence_number:
      typeof row.drivers_licence_number === "string"
        ? row.drivers_licence_number
        : null,
    drivers_licence_class:
      typeof row.drivers_licence_class === "string"
        ? row.drivers_licence_class
        : null,
    drivers_licence_expiry:
      typeof row.drivers_licence_expiry === "string"
        ? row.drivers_licence_expiry
        : null,
    photo_url: typeof row.photo_url === "string" ? row.photo_url : null,
    onboarding_completed:
      typeof row.onboarding_completed === "boolean"
        ? row.onboarding_completed
        : false,
    vocs,
  };
}

async function fetchWorkerVocsForOnboarding(
  admin: SupabaseClient,
  workerId: string
): Promise<WorkerOnboardingRecord["vocs"]> {
  const { data, error } = await admin
    .from("worker_vocs")
    .select("id, title, voc_type, issuing_org, issue_date, expiry_date, document_url")
    .eq("worker_id", workerId);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    title: String(row.title ?? row.voc_type ?? ""),
    voc_type: row.voc_type ?? null,
    issuing_org: row.issuing_org ?? null,
    issue_date: row.issue_date ?? null,
    expiry_date: row.expiry_date ?? null,
    document_url: row.document_url ?? null,
  }));
}

export function buildFallbackOnboardingRecord(
  workerId: string,
  user: User,
  partial?: Partial<WorkerOnboardingRecord>
): WorkerOnboardingRecord {
  const fullName = readUserFullName(user) || user.email?.split("@")[0] || "";
  const parts = splitWorkerFullName(fullName);

  return mapWorkerRowToOnboardingRecord(
    {
      id: workerId,
      email: partial?.email ?? user.email ?? "",
      full_name: partial?.full_name ?? (fullName || null),
      first_name: partial?.first_name ?? (parts.firstName || null),
      last_name: partial?.last_name ?? (parts.lastName || null),
      phone: partial?.phone ?? null,
      emergency_contact: partial?.address ?? null,
      emergency_contact_name: partial?.emergency_contact_name ?? null,
      emergency_contact_phone: partial?.emergency_contact_phone ?? null,
      emergency_contact_relationship:
        partial?.emergency_contact_relationship ?? null,
      bank_name: partial?.bank_name ?? null,
      bank_bsb: partial?.bank_bsb ?? null,
      bank_account_number: partial?.bank_account_number ?? null,
      super_fund: partial?.super_fund ?? null,
      super_member_number: partial?.super_member_number ?? null,
      super_usi: partial?.super_usi ?? null,
      tfn: partial?.tfn ?? null,
      redundancy_fund_name: partial?.redundancy_fund_name ?? null,
      redundancy_member_number: partial?.redundancy_member_number ?? null,
      white_card_number: partial?.white_card_number ?? null,
      state: partial?.state ?? null,
      silica_cert_number: partial?.silica_cert_number ?? null,
      silica_cert_issue_date: partial?.silica_cert_issue_date ?? null,
      drivers_licence_number: partial?.drivers_licence_number ?? null,
      drivers_licence_class: partial?.drivers_licence_class ?? null,
      drivers_licence_expiry: partial?.drivers_licence_expiry ?? null,
      photo_url: partial?.photo_url ?? null,
      onboarding_completed: partial?.onboarding_completed ?? false,
    },
    partial?.vocs ?? []
  );
}

const WORKER_ONBOARDING_SELECT_VARIANTS = [
  "id, email, full_name, first_name, last_name, phone, photo_url, emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, bank_name, bank_bsb, bank_account_number, super_fund, super_member_number, super_usi, tfn, redundancy_fund_name, redundancy_member_number, white_card_number, state, silica_cert_number, silica_cert_issue_date, drivers_licence_number, drivers_licence_class, drivers_licence_expiry, onboarding_completed",
  "id, email, full_name, first_name, last_name, phone, emergency_contact, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, bank_name, bank_bsb, bank_account_number, super_fund, super_member_number, super_usi, tfn, redundancy_fund_name, redundancy_member_number, white_card_number, state, silica_cert_number, silica_cert_issue_date, drivers_licence_number, drivers_licence_class, drivers_licence_expiry, onboarding_completed",
  "id, email, full_name, first_name, last_name, phone, emergency_contact_name, emergency_contact_phone, white_card_number, drivers_licence_number, onboarding_completed",
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

    const vocs = await fetchWorkerVocsForOnboarding(admin, workerId);
    return mapWorkerRowToOnboardingRecord(
      data as unknown as Record<string, unknown>,
      vocs
    );
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
