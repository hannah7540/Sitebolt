"use server";

import { revalidatePath } from "next/cache";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatWorkerBsb, buildWorkerNameFields } from "@/lib/worker-utils";
import { getRecordOrganisationId, resolveActiveOrganisationId } from "@/lib/tenant-scope";
import {
  logWorkerProfileUpdateAlert,
  mapWorkerRowToProfileSnapshot,
  type WorkerProfileSnapshot,
} from "@/lib/worker-profile-alerts";

const FINANCIAL_SELECT =
  "bank_name, bank_account_name, bank_bsb, bank_account_number, super_fund, super_member_number, tfn, first_name, last_name, full_name";
const FINANCIAL_SELECT_WITHOUT_ACCOUNT_NAME =
  "bank_name, bank_bsb, bank_account_number, super_fund, super_member_number, tfn, first_name, last_name, full_name";

export type WorkerPersonalFinancialInput = {
  workerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  suburb: string;
  postcode: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  bankName: string;
  accountName: string;
  bankBsb: string;
  bankAccountNumber: string;
  superFund: string;
  superMemberNumber: string;
  tfn: string;
};

export type WorkerTicketDetailsInput = {
  workerId: string;
  whiteCardNumber: string;
  whiteCardIssueDate: string;
  whiteCardPhotoUrl: string | null;
  silicaCertNumber: string;
  silicaCertIssueDate: string;
  silicaCertPhotoUrl: string | null;
  driversLicenceNumber: string;
  driversLicenceClass: string;
  driversLicenceExpiry: string;
  driversLicencePhotoUrl: string | null;
};

export type WorkerFinancialDetailsInput = {
  workerId: string;
  bankName: string;
  accountName: string;
  bankBsb: string;
  bankAccountNumber: string;
  superFund: string;
  superMemberNumber: string;
  tfn: string;
};

export type WorkerFinancialDetailsResult = {
  error: string | null;
  values?: {
    bank_name: string | null;
    bank_account_name: string | null;
    bank_bsb: string | null;
    bank_account_number: string | null;
    super_fund: string | null;
    super_member_number: string | null;
    tfn: string | null;
  };
};

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullIfBlankDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function updateOwnWorkerColumns(
  workerId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const admin = createSupabaseAdminClient();
  let next: Record<string, unknown> = { ...payload, updated_at: new Date().toISOString() };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await admin.from("workers").update(next).eq("id", workerId);
    if (!error) {
      revalidatePath("/worker-dashboard");
      revalidatePath("/worker/dashboard");
      revalidatePath(`/worker/${workerId}`);
      return { error: null };
    }

    const missing =
      parseMissingColumnFromError(error.message) ??
      (error.message.toLowerCase().includes("bank_account_name")
        ? "bank_account_name"
        : null);
    if (!missing || !(missing in next)) {
      return { error: error.message };
    }
    next = stripMissingColumn(next, missing);
  }

  return { error: "Failed to save profile details." };
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const PROFILE_SELECT =
  "id, organisation_id, first_name, last_name, full_name, email, phone, address_line_1, address_line_2, suburb, postcode, emergency_contact_name, emergency_contact_phone, bank_name, bank_account_name, bank_bsb, bank_account_number, super_fund, super_member_number, tfn";

async function fetchCurrentWorkerProfile(
  workerId: string
): Promise<{ snapshot: WorkerProfileSnapshot; organisationId: string | null } | { error: string }> {
  const admin = createSupabaseAdminClient();
  let select = PROFILE_SELECT;
  let { data, error } = await admin.from("workers").select(select).eq("id", workerId).maybeSingle();

  for (let attempt = 0; attempt < 8 && error; attempt += 1) {
    const missing =
      parseMissingColumnFromError(error.message) ??
      (error.message.toLowerCase().includes("bank_account_name")
        ? "bank_account_name"
        : null);
    if (!missing) break;
    select = select
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== missing)
      .join(", ");
    const retry = await admin.from("workers").select(select).eq("id", workerId).maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) return { error: error.message };
  if (!data || typeof data !== "object") {
    return { error: "Failed to load current worker details." };
  }

  const row = data as unknown as Record<string, unknown>;
  return {
    snapshot: mapWorkerRowToProfileSnapshot(row),
    organisationId: getRecordOrganisationId(row) ?? null,
  };
}

async function requireOwnWorkerId(
  workerId: string
): Promise<{ workerId: string; error: string | null }> {
  if (!isSupabaseAdminConfigured()) {
    return { workerId: "", error: "Server configuration error." };
  }

  const session = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError) return { workerId: "", error: authError.message };
  if (!user) return { workerId: "", error: "Not authenticated." };

  const admin = createSupabaseAdminClient();
  const match = await matchWorkerForAuthUser(admin, user, { skipEmailLookup: false });
  if (!match?.workerId) {
    return { workerId: "", error: "Worker profile not found for this account." };
  }
  if (match.workerId !== workerId) {
    return { workerId: "", error: "You can only access your own profile details." };
  }
  return { workerId: match.workerId, error: null };
}

export async function getWorkerFinancialDetails(
  workerId: string
): Promise<WorkerFinancialDetailsResult> {
  const trimmedId = workerId.trim();
  if (!trimmedId) return { error: "Worker id is required." };

  const auth = await requireOwnWorkerId(trimmedId);
  if (auth.error) return { error: auth.error };

  const admin = createSupabaseAdminClient();
  let select = FINANCIAL_SELECT;
  let { data, error } = await admin
    .from("workers")
    .select(select)
    .eq("id", auth.workerId)
    .maybeSingle();

  if (error && error.message.toLowerCase().includes("bank_account_name")) {
    select = FINANCIAL_SELECT_WITHOUT_ACCOUNT_NAME;
    const retry = await admin
      .from("workers")
      .select(select)
      .eq("id", auth.workerId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) return { error: error.message };
  if (!data || typeof data !== "object") {
    return { error: "Failed to load financial details." };
  }

  const row = data as unknown as Record<string, unknown>;
  const fullName =
    asText(row.full_name) ||
    [asText(row.first_name), asText(row.last_name)].filter(Boolean).join(" ");

  return {
    error: null,
    values: {
      bank_name: asText(row.bank_name),
      bank_account_name: asText(row.bank_account_name) ?? (fullName || null),
      bank_bsb: asText(row.bank_bsb),
      bank_account_number: asText(row.bank_account_number),
      super_fund: asText(row.super_fund),
      super_member_number: asText(row.super_member_number),
      tfn: asText(row.tfn),
    },
  };
}

export async function updateWorkerFinancialDetails(
  input: WorkerFinancialDetailsInput
): Promise<WorkerFinancialDetailsResult> {
  const workerId = input.workerId.trim();
  if (!workerId) {
    return { error: "Worker id is required." };
  }

  const auth = await requireOwnWorkerId(workerId);
  if (auth.error) return { error: auth.error };

  const current = await fetchCurrentWorkerProfile(auth.workerId);
  if ("error" in current) return { error: current.error };

  const values = {
    bank_name: nullIfBlank(input.bankName),
    bank_account_name: nullIfBlank(input.accountName),
    bank_bsb: formatWorkerBsb(input.bankBsb),
    bank_account_number: nullIfBlank(input.bankAccountNumber),
    super_fund: nullIfBlank(input.superFund),
    super_member_number: nullIfBlank(input.superMemberNumber),
    tfn: nullIfBlank(input.tfn),
  };

  const result = await updateOwnWorkerColumns(auth.workerId, values);
  if (result.error) return { error: result.error };

  const after: WorkerProfileSnapshot = {
    ...current.snapshot,
    ...values,
  };
  const admin = createSupabaseAdminClient();
  await logWorkerProfileUpdateAlert({
    admin,
    workerId: auth.workerId,
    organisationId: current.organisationId ?? resolveActiveOrganisationId(),
    before: current.snapshot,
    after,
  });

  revalidatePath("/organisation/alerts");
  return { error: null, values };
}

export async function updateWorkerPersonalAndFinancialDetails(
  input: WorkerPersonalFinancialInput
): Promise<WorkerFinancialDetailsResult> {
  const workerId = input.workerId.trim();
  if (!workerId) {
    return { error: "Worker id is required." };
  }

  const auth = await requireOwnWorkerId(workerId);
  if (auth.error) return { error: auth.error };

  const current = await fetchCurrentWorkerProfile(auth.workerId);
  if ("error" in current) return { error: current.error };

  const names = buildWorkerNameFields(input.firstName, input.lastName);
  const values = {
    bank_name: nullIfBlank(input.bankName),
    bank_account_name: nullIfBlank(input.accountName),
    bank_bsb: formatWorkerBsb(input.bankBsb),
    bank_account_number: nullIfBlank(input.bankAccountNumber),
    super_fund: nullIfBlank(input.superFund),
    super_member_number: nullIfBlank(input.superMemberNumber),
    tfn: nullIfBlank(input.tfn),
  };

  const personal = {
    first_name: names.first_name,
    last_name: names.last_name,
    full_name: names.full_name || null,
    worker_name: names.worker_name || null,
    email: nullIfBlank(input.email),
    phone: nullIfBlank(input.phone),
    address_line_1: nullIfBlank(input.addressLine1),
    address_line_2: nullIfBlank(input.addressLine2),
    suburb: nullIfBlank(input.suburb),
    postcode: nullIfBlank(input.postcode),
    emergency_contact_name: nullIfBlank(input.emergencyContactName),
    emergency_contact_phone: nullIfBlank(input.emergencyContactPhone),
  };

  const result = await updateOwnWorkerColumns(auth.workerId, {
    ...personal,
    ...values,
  });
  if (result.error) return { error: result.error };

  const after: WorkerProfileSnapshot = {
    ...current.snapshot,
    ...personal,
    ...values,
  };
  const admin = createSupabaseAdminClient();
  await logWorkerProfileUpdateAlert({
    admin,
    workerId: auth.workerId,
    organisationId: current.organisationId ?? resolveActiveOrganisationId(),
    before: current.snapshot,
    after,
  });

  revalidatePath("/organisation/alerts");
  return { error: null, values };
}

export async function updateWorkerTicketDetails(
  input: WorkerTicketDetailsInput
): Promise<{ error: string | null }> {
  const workerId = input.workerId.trim();
  if (!workerId) {
    return { error: "Worker id is required." };
  }

  const auth = await requireOwnWorkerId(workerId);
  if (auth.error) return { error: auth.error };

  return updateOwnWorkerColumns(auth.workerId, {
    white_card_number: nullIfBlank(input.whiteCardNumber),
    white_card_issue_date: nullIfBlankDate(input.whiteCardIssueDate),
    white_card_photo_url: nullIfBlank(input.whiteCardPhotoUrl ?? ""),
    silica_cert_number: nullIfBlank(input.silicaCertNumber),
    silica_cert_issue_date: nullIfBlankDate(input.silicaCertIssueDate),
    silica_cert_photo_url: nullIfBlank(input.silicaCertPhotoUrl ?? ""),
    drivers_licence_number: nullIfBlank(input.driversLicenceNumber),
    drivers_licence_class: nullIfBlank(input.driversLicenceClass),
    drivers_licence_expiry: nullIfBlankDate(input.driversLicenceExpiry),
    drivers_licence_photo_url: nullIfBlank(input.driversLicencePhotoUrl ?? ""),
  });
}
