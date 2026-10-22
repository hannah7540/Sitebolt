export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseMissingColumnFromError, stripMissingColumn } from "@/lib/form-payload-utils";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PostgrestLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null;

function formatPostgrestError(error: PostgrestLikeError, fallback: string): string {
  if (!error) return fallback;
  const parts = [error.message, error.details, error.hint, error.code ? `code=${error.code}` : ""]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.join(" | ") || fallback;
}

function createOnboardServiceRoleClient(): SupabaseClient {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for onboarding updates."
    );
  }
  console.log("[subcontractor-onboard] Using direct service-role createClient", {
    url,
    serviceRoleKeyLength: serviceRoleKey.length,
  });
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  });
}

const SELECT_BASE =
  "id, company_name, email, contact_email, contact_name, contact_person, status";
const SELECT_WITH_EXPIRY = `${SELECT_BASE}, subcontractor_invite_expire_at`;

function normalizeText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toRecord(row: Record<string, unknown>, fallbackEmail = "") {
  return {
    id: String(row.id ?? ""),
    company_name: normalizeText(row.company_name) || "your company",
    email: normalizeText(row.email) || normalizeText(row.contact_email) || fallbackEmail,
    contact_name: normalizeText(row.contact_name) || normalizeText(row.contact_person),
  };
}

async function loadInvitedByToken(token: string): Promise<{
  record: ReturnType<typeof toRecord> | null;
  row: Record<string, unknown> | null;
  error: string | null;
  status: number;
}> {
  const admin = createOnboardServiceRoleClient();
  const primary = await admin
    .from("subcontractors")
    .select(SELECT_WITH_EXPIRY)
    .eq("invite_token", token)
    .maybeSingle();

  let data = (primary.data as unknown as Record<string, unknown> | null) ?? null;
  let error = primary.error;
  if (error && /subcontractor_invite_expire_at|does not exist|schema cache/i.test(error.message)) {
    const fallback = await admin
      .from("subcontractors")
      .select(SELECT_BASE)
      .eq("invite_token", token)
      .maybeSingle();
    data = (fallback.data as unknown as Record<string, unknown> | null) ?? null;
    error = fallback.error;
  }

  if (error) {
    return {
      record: null,
      row: null,
      error: formatPostgrestError(error, error.message),
      status: 500,
    };
  }
  if (!data) {
    return {
      record: null,
      row: null,
      error: "This onboarding link is invalid or has already been used.",
      status: 404,
    };
  }

  const expiresAt = normalizeText(data.subcontractor_invite_expire_at);
  if (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < Date.now()) {
    return {
      record: null,
      row: null,
      error: "This onboarding link has expired. Ask the contractor to resend the invite.",
      status: 410,
    };
  }

  return { record: toRecord(data), row: data, error: null, status: 200 };
}

async function updateWithMissingColumnRetry(
  table: string,
  id: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const admin = createOnboardServiceRoleClient();
  let current = { ...payload };
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await admin.from(table).update(current).eq("id", id);
    if (!error) return { error: null };
    lastError = formatPostgrestError(error, error.message);
    console.error(`[subcontractor-onboard] ${table} update failed`, { attempt, id, error });
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { error: lastError };
  }
  return { error: lastError };
}

async function insertWithMissingColumnRetry(
  table: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const admin = createOnboardServiceRoleClient();
  let current = { ...payload };
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await admin.from(table).insert(current);
    if (!error) return { error: null };
    lastError = formatPostgrestError(error, error.message);
    console.error(`[subcontractor-onboard] ${table} insert failed`, { attempt, error });
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { error: lastError };
  }
  return { error: lastError };
}

export async function GET(request: Request) {
  try {
    if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() || !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()) {
      return NextResponse.json(
        {
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for onboarding updates.",
        },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      return NextResponse.json(
        { error: "This invite link is missing an onboarding token." },
        { status: 400 }
      );
    }

    const invited = await loadInvitedByToken(token);
    if (invited.error || !invited.record) {
      return NextResponse.json({ error: invited.error }, { status: invited.status });
    }

    return NextResponse.json({ record: invited.record });
  } catch (error) {
    console.error("[subcontractor-onboard] Lookup route failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load the onboarding invite.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() || !(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()) {
      return NextResponse.json(
        {
          error:
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for onboarding updates.",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      token?: string;
      authUserId?: string;
      address?: string;
      abn?: string;
      plExpiry?: string;
      plValue?: string;
      plDocumentUrl?: string;
      piExpiry?: string;
      piValue?: string;
      piDocumentUrl?: string;
    };

    const token = typeof body.token === "string" ? body.token.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const abn = typeof body.abn === "string" ? body.abn.trim() : "";
    const plExpiry = typeof body.plExpiry === "string" ? body.plExpiry.trim() : "";
    const plValue = typeof body.plValue === "string" ? body.plValue.trim() : "";
    const plDocumentUrl =
      typeof body.plDocumentUrl === "string" ? body.plDocumentUrl.trim() : "";
    const piExpiry = typeof body.piExpiry === "string" ? body.piExpiry.trim() : "";
    const piValue = typeof body.piValue === "string" ? body.piValue.trim() : "";
    const piDocumentUrl =
      typeof body.piDocumentUrl === "string" ? body.piDocumentUrl.trim() : "";
    const providedUserId =
      typeof body.authUserId === "string" ? body.authUserId.trim() : "";

    if (!token) {
      return NextResponse.json(
        { error: "This invite link is missing an onboarding token." },
        { status: 400 }
      );
    }
    if (!address) {
      return NextResponse.json({ error: "Full address is required." }, { status: 400 });
    }
    if (!abn) {
      return NextResponse.json({ error: "ABN is required." }, { status: 400 });
    }
    if (!plExpiry || !plValue || !plDocumentUrl) {
      return NextResponse.json(
        { error: "Public Liability expiry, policy value, and document are required." },
        { status: 400 }
      );
    }
    if (!piExpiry || !piValue || !piDocumentUrl) {
      return NextResponse.json(
        { error: "Professional Indemnity expiry, policy value, and document are required." },
        { status: 400 }
      );
    }

    const invited = await loadInvitedByToken(token);
    if (invited.error || !invited.record?.id) {
      return NextResponse.json({ error: invited.error ?? "Invite not found." }, {
        status: invited.status,
      });
    }

    // Service-role client bypasses RLS after the invite token is verified.
    // Credentials: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
    const admin = createOnboardServiceRoleClient();
    const inviteEmail = invited.record.email.trim().toLowerCase();
    let authUserId: string | null = null;

    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id && (user.email ?? "").trim().toLowerCase() === inviteEmail) {
        authUserId = user.id;
      }
    } catch (sessionError) {
      console.warn("[subcontractor-onboard] Session lookup skipped", sessionError);
    }

    if (!authUserId && providedUserId) {
      const { data, error } = await admin.auth.admin.getUserById(providedUserId);
      if (error) {
        console.warn("[subcontractor-onboard] Auth user lookup failed", error);
      } else if ((data.user?.email ?? "").trim().toLowerCase() === inviteEmail) {
        authUserId = data.user.id;
      }
    }

    const updatePayload: Record<string, unknown> = {
      address,
      abn,
      status: "active",
      public_liability_expiry: plExpiry,
      public_liability_value: plValue,
      public_liability_policy_value: plValue,
      public_liability_document_url: plDocumentUrl,
      pl_expiry: plExpiry,
      pl_policy_value: plValue,
      pl_document_url: plDocumentUrl,
      professional_indemnity_expiry: piExpiry,
      professional_indemnity_value: piValue,
      professional_indemnity_document_url: piDocumentUrl,
      pi_expiry: piExpiry,
      pi_policy_value: piValue,
      pi_document_url: piDocumentUrl,
      invite_token: null,
      subcontractor_invite_expire_at: null,
      updated_at: new Date().toISOString(),
    };
    if (authUserId) {
      updatePayload.user_id = authUserId;
      updatePayload.auth_user_id = authUserId;
    }

    const update = await updateWithMissingColumnRetry(
      "subcontractors",
      invited.record.id,
      updatePayload
    );
    if (update.error) {
      console.error("[subcontractor-onboard] Update failed", update.error);
      return NextResponse.json({ error: update.error }, { status: 500 });
    }

    const plDoc = await insertWithMissingColumnRetry("subcontractor_documents", {
      subcontractor_id: invited.record.id,
      document_type: "public_liability",
      title: `Public Liability — ${plValue}`,
      expiry_date: plExpiry,
      document_url: plDocumentUrl,
    });
    if (plDoc.error) {
      return NextResponse.json({ error: plDoc.error }, { status: 500 });
    }
    const piDoc = await insertWithMissingColumnRetry("subcontractor_documents", {
      subcontractor_id: invited.record.id,
      document_type: "professional_indemnity",
      title: `Professional Indemnity — ${piValue}`,
      expiry_date: piExpiry,
      document_url: piDocumentUrl,
    });
    if (piDoc.error) {
      return NextResponse.json({ error: piDoc.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      id: invited.record.id,
      authUserId,
    });
  } catch (error) {
    console.error("[subcontractor-onboard] Complete route failed", error);
    return NextResponse.json(
      { error: errorMessage(error, "Onboarding update failed.") },
      { status: 500 }
    );
  }
}
