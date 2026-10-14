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
import { formatWorkerBsb } from "@/lib/worker-utils";

const FINANCIAL_SELECT =
  "bank_name, bank_account_name, bank_bsb, bank_account_number, super_fund, super_member_number, tfn, first_name, last_name, full_name";
const FINANCIAL_SELECT_WITHOUT_ACCOUNT_NAME =
  "bank_name, bank_bsb, bank_account_number, super_fund, super_member_number, tfn, first_name, last_name, full_name";

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

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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
    return { workerId: "", error: "You can only access your own financial details." };
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

  const admin = createSupabaseAdminClient();

  const values = {
    bank_name: nullIfBlank(input.bankName),
    bank_account_name: nullIfBlank(input.accountName),
    bank_bsb: formatWorkerBsb(input.bankBsb),
    bank_account_number: nullIfBlank(input.bankAccountNumber),
    super_fund: nullIfBlank(input.superFund),
    super_member_number: nullIfBlank(input.superMemberNumber),
    tfn: nullIfBlank(input.tfn),
  };

  let payload: Record<string, unknown> = {
    ...values,
    updated_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await admin.from("workers").update(payload).eq("id", auth.workerId);
    if (!error) {
      revalidatePath("/worker-dashboard");
      revalidatePath("/worker/dashboard");
      revalidatePath(`/worker/${workerId}`);
      return { error: null, values };
    }

    const missing =
      parseMissingColumnFromError(error.message) ??
      (error.message.toLowerCase().includes("bank_account_name")
        ? "bank_account_name"
        : null);
    if (!missing || !(missing in payload)) {
      return { error: error.message };
    }
    payload = stripMissingColumn(payload, missing);
    if (missing === "bank_account_name") {
      values.bank_account_name = null;
    }
  }

  return { error: "Failed to save financial details." };
}
