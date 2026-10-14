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

export async function updateWorkerFinancialDetails(
  input: WorkerFinancialDetailsInput
): Promise<WorkerFinancialDetailsResult> {
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server configuration error." };
  }

  const workerId = input.workerId.trim();
  if (!workerId) {
    return { error: "Worker id is required." };
  }

  const session = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError) return { error: authError.message };
  if (!user) return { error: "Not authenticated." };

  const admin = createSupabaseAdminClient();
  const match = await matchWorkerForAuthUser(admin, user, { skipEmailLookup: false });
  if (!match?.workerId) {
    return { error: "Worker profile not found for this account." };
  }
  if (match.workerId !== workerId) {
    return { error: "You can only update your own financial details." };
  }

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
    const { error } = await admin.from("workers").update(payload).eq("id", workerId);
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
