"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getInvalidBulkOnboardingFields,
  normalizeBulkOnboardingWorker,
  workerDisplayName,
  type BulkOnboardingWorker,
} from "@/lib/bulk-onboarding";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import { canManageOrganisation, DEFAULT_WORKER_SECURITY_ROLE, normalizeSecurityRole } from "@/lib/security-roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";
import {
  buildWorkerNameFields,
  computeWorkerStatusFromExpiries,
  formatWorkerBsb,
  nullIfBlankWorkerDate,
  sanitizeWorkerWritePayload,
} from "@/lib/worker-utils";
import { sendWorkerInviteEmailViaResend } from "@/lib/worker-invite-resend";
import { assignDefaultPayRuleToWorkerAdmin } from "@/lib/worker-pay-rule-assignment";

export type BulkOnboardResult = {
  error: string | null;
  imported: number;
  invited: number;
  inviteErrors: string[];
};

async function insertWorkerVocs(
  admin: SupabaseClient,
  workerId: string,
  worker: BulkOnboardingWorker
): Promise<string | null> {
  const rows = [
    {
      worker_id: workerId,
      title: "White Card",
      voc_type: "White Card",
      name: "White Card",
      issuing_org: worker.white_card_number.trim() || null,
      issue_date: nullIfBlankWorkerDate(worker.white_card_issue_date),
      expiry_date: null,
      document_url: null,
    },
    {
      worker_id: workerId,
      title: "Silica Awareness",
      voc_type: "Silica Awareness",
      name: "Silica Awareness",
      issuing_org: worker.silica_cert_number.trim() || null,
      issue_date: nullIfBlankWorkerDate(worker.silica_cert_issue_date),
      expiry_date: null,
      document_url: null,
    },
    {
      worker_id: workerId,
      title: "Driver's Licence",
      voc_type: "Driver's Licence",
      name: "Driver's Licence",
      issuing_org: [worker.drivers_licence_number, worker.drivers_licence_class]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" · ") || null,
      issue_date: null,
      expiry_date: nullIfBlankWorkerDate(worker.drivers_licence_expiry),
      document_url: null,
    },
  ];

  const attempts = [
    rows,
    rows.map(({ name: _name, voc_type: _vocType, ...row }) => row),
    rows.map(({ name: _name, ...row }) => row),
  ];

  let lastError: string | null = null;
  for (const payload of attempts) {
    const { error } = await admin.from("worker_vocs").insert(payload);
    if (!error) return null;
    lastError = error.message;
    const lower = error.message.toLowerCase();
    if (
      !lower.includes("column") &&
      !lower.includes("schema cache") &&
      !lower.includes("could not find")
    ) {
      break;
    }
  }

  return lastError ?? "Unable to save compliance ticket records.";
}

async function insertWorkerProfile(
  admin: SupabaseClient,
  orgId: string,
  worker: BulkOnboardingWorker
): Promise<{ workerId: string | null; error: string | null }> {
  const names = buildWorkerNameFields(worker.first_name, worker.last_name);
  const licenceExpiry = nullIfBlankWorkerDate(worker.drivers_licence_expiry);
  let payload: Record<string, unknown> = sanitizeWorkerWritePayload({
    ...names,
    organisation_id: orgId,
    email: worker.email.trim().toLowerCase(),
    phone: worker.phone.trim() || null,
    dob: nullIfBlankWorkerDate(worker.dob),
    address_line_1: worker.address_line_1.trim() || null,
    address_line_2: worker.address_line_2.trim() || null,
    suburb: worker.suburb.trim() || null,
    postcode: worker.postcode.trim() || null,
    state: worker.state.trim() || null,
    emergency_contact: worker.emergency_contact.trim() || worker.emergency_contact_name.trim() || null,
    emergency_contact_name: worker.emergency_contact_name.trim() || null,
    emergency_contact_relationship: worker.emergency_contact_relationship.trim() || null,
    emergency_contact_phone: worker.emergency_contact_phone.trim() || null,
    emergency_contact_number: worker.emergency_contact_phone.trim() || null,
    bank_name: worker.bank_name.trim() || null,
    bank_account_name: worker.bank_account_name.trim() || names.full_name || null,
    bank_bsb: formatWorkerBsb(worker.bank_bsb),
    bank_account_number: worker.bank_account_number.replace(/\s+/g, "") || null,
    super_fund: worker.super_fund.trim() || null,
    super_member_number: worker.super_member_number.trim() || null,
    tfn: worker.tfn.replace(/\s+/g, "") || null,
    white_card_number: worker.white_card_number.trim() || null,
    white_card_issue_date: nullIfBlankWorkerDate(worker.white_card_issue_date),
    white_card_date: nullIfBlankWorkerDate(worker.white_card_issue_date),
    white_card_provided: true,
    silica_cert_number: worker.silica_cert_number.trim() || null,
    silica_cert_issue_date: nullIfBlankWorkerDate(worker.silica_cert_issue_date),
    silica_cert_date: nullIfBlankWorkerDate(worker.silica_cert_issue_date),
    silica_cert_provided: true,
    drivers_licence_number: worker.drivers_licence_number.trim() || null,
    drivers_licence_class: worker.drivers_licence_class.trim() || null,
    drivers_licence_expiry: licenceExpiry,
    security_role: DEFAULT_WORKER_SECURITY_ROLE,
    status: computeWorkerStatusFromExpiries([licenceExpiry]),
    onboarding_completed: false,
    invite_status: "pending",
    worker_category: "internal",
  });

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await admin
      .from("workers")
      .insert([payload])
      .select("id")
      .single();

    if (!error) {
      return { workerId: data?.id ?? null, error: null };
    }

    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload) {
      payload = stripMissingColumn(payload, missing);
      continue;
    }

    return { workerId: null, error: error.message };
  }

  return { workerId: null, error: "Unable to insert worker profile." };
}

export async function submitBulkOnboarding(
  rawWorkers: BulkOnboardingWorker[]
): Promise<BulkOnboardResult> {
  if (!isSupabaseAdminConfigured()) {
    return {
      error: "Server admin client is not configured.",
      imported: 0,
      invited: 0,
      inviteErrors: [],
    };
  }

  const orgId = await resolveActiveOrganisationIdFromCookies();
  if (!orgId) {
    return {
      error: "Active organisation is required.",
      imported: 0,
      invited: 0,
      inviteErrors: [],
    };
  }

  const session = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError) {
    return { error: authError.message, imported: 0, invited: 0, inviteErrors: [] };
  }
  if (!user) {
    return { error: "Not authenticated.", imported: 0, invited: 0, inviteErrors: [] };
  }

  const admin = createSupabaseAdminClient();
  const { data: actorRow } = await admin
    .from("workers")
    .select("id, security_role")
    .eq("email", user.email ?? "")
    .maybeSingle();

  const role = normalizeSecurityRole(
    (actorRow as { security_role?: string } | null)?.security_role
  );
  if (!canManageOrganisation(role)) {
    return { error: "Forbidden.", imported: 0, invited: 0, inviteErrors: [] };
  }

  if (!Array.isArray(rawWorkers) || rawWorkers.length === 0) {
    return {
      error: "No workers to import.",
      imported: 0,
      invited: 0,
      inviteErrors: [],
    };
  }

  const workers = rawWorkers.map((worker) => normalizeBulkOnboardingWorker(worker));
  for (const worker of workers) {
    const invalid = getInvalidBulkOnboardingFields(worker);
    if (invalid.length > 0) {
      return {
        error: `${workerDisplayName(worker)} still has incomplete fields.`,
        imported: 0,
        invited: 0,
        inviteErrors: [],
      };
    }
  }

  const emails = workers.map((worker) => worker.email.trim().toLowerCase());
  const { data: existingRows, error: existingError } = await admin
    .from("workers")
    .select("email")
    .eq("organisation_id", orgId)
    .in("email", emails);

  if (existingError) {
    return {
      error: existingError.message,
      imported: 0,
      invited: 0,
      inviteErrors: [],
    };
  }

  const existing = (existingRows ?? [])
    .map((row) => String((row as { email?: string }).email ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (existing.length > 0) {
    return {
      error: `These emails already exist in this organisation: ${existing.join(", ")}.`,
      imported: 0,
      invited: 0,
      inviteErrors: [],
    };
  }

  const insertedIds: string[] = [];

  try {
    for (const worker of workers) {
      const inserted = await insertWorkerProfile(admin, orgId, worker);
      if (inserted.error || !inserted.workerId) {
        throw new Error(
          inserted.error ?? `Failed to create ${workerDisplayName(worker)}.`
        );
      }

      insertedIds.push(inserted.workerId);

      const vocError = await insertWorkerVocs(admin, inserted.workerId, worker);
      if (vocError) {
        throw new Error(
          `Created ${workerDisplayName(worker)} but could not save tickets: ${vocError}`
        );
      }

      try {
        await assignDefaultPayRuleToWorkerAdmin(admin, inserted.workerId, worker.state);
      } catch (cause) {
        console.warn("[bulk-onboard] pay rule assignment skipped:", cause);
      }

      try {
        const { applyAutomaticWorkerAssignmentsForWorker } = await import(
          "@/lib/services/worker-assignment"
        );
        await applyAutomaticWorkerAssignmentsForWorker({
          workerId: inserted.workerId,
          state: worker.state || null,
          projectIds: [],
          assignCompanySwms: true,
        });
      } catch (cause) {
        console.warn("[bulk-onboard] auto-assign skipped:", cause);
      }

      try {
        const { syncPublicHolidaysForWorker } = await import("@/lib/public-holiday-sync");
        await syncPublicHolidaysForWorker(inserted.workerId);
      } catch (cause) {
        console.warn("[bulk-onboard] public holiday sync skipped:", cause);
      }
    }
  } catch (cause) {
    if (insertedIds.length > 0) {
      await admin.from("worker_vocs").delete().in("worker_id", insertedIds);
      await admin.from("workers").delete().in("id", insertedIds);
    }
    return {
      error: cause instanceof Error ? cause.message : "Bulk onboarding failed.",
      imported: 0,
      invited: 0,
      inviteErrors: [],
    };
  }

  const inviteErrors: string[] = [];
  let invited = 0;

  for (let index = 0; index < workers.length; index += 1) {
    const worker = workers[index];
    const workerId = insertedIds[index];
    const result = await sendWorkerInviteEmailViaResend(worker.email, { workerId });
    if (result.success) {
      invited += 1;
      continue;
    }
    inviteErrors.push(
      `${workerDisplayName(worker)}: ${result.error ?? "Invite email failed."}`
    );
  }

  revalidatePath("/organisation/workers");
  revalidatePath("/organisation/onboarding/bulk");

  return {
    error: null,
    imported: insertedIds.length,
    invited,
    inviteErrors,
  };
}
