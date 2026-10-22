export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { ensureWorkerInviteRecord } from "@/lib/ensure-worker-profile";
import { parseMissingColumnFromError, stripMissingColumn } from "@/lib/form-payload-utils";
import { HIRED_LABOUR_CATEGORY } from "@/lib/hired-labour";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { loadCurrentSubcontractorPortal } from "@/lib/subcontractor-portal";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { stampOrganisationId } from "@/lib/tenant-scope";
import { sendWorkerInviteEmailViaResend } from "@/lib/worker-invite-resend";
import { buildWorkerNameFields } from "@/lib/worker-utils";

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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

async function insertWithMissingColumnRetry(
  table: string,
  payload: Record<string, unknown>,
  select = "id"
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const admin = createSupabaseAdminClient();
  let current = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await admin.from(table).insert(current).select(select).single();
    if (!error) {
      return { data: (data as unknown as Record<string, unknown> | null) ?? null, error: null };
    }
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { data: null, error: formatPostgrestError(error, `Could not insert into ${table}.`) };
  }
  return { data: null, error: `Could not insert into ${table}.` };
}

export async function POST(request: Request) {
  try {
    const portal = await loadCurrentSubcontractorPortal();
    if (!portal.userId) {
      return NextResponse.json({ error: "Sign in to add a worker." }, { status: 401 });
    }
    if (!portal.record?.id) {
      return NextResponse.json(
        { error: "Subcontractor profile is missing for this account." },
        { status: 403 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local or Vercel (server-only).",
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      subcontractorId?: unknown;
      organisationId?: unknown;
      firstName?: unknown;
      lastName?: unknown;
      email?: unknown;
      phone?: unknown;
      trade?: unknown;
      whiteCardUrl?: unknown;
      silicaUrl?: unknown;
    };

    const subcontractorId = text(body.subcontractorId);
    const firstName = text(body.firstName);
    const lastName = text(body.lastName);
    const email = text(body.email).toLowerCase();
    const phone = text(body.phone);
    const trade = text(body.trade);
    const whiteCardUrl = text(body.whiteCardUrl);
    const silicaUrl = text(body.silicaUrl);
    const requestedOrgId = text(body.organisationId);
    const organisationId = text(portal.record.organisation_id) || requestedOrgId;

    if (!subcontractorId || subcontractorId !== portal.record.id) {
      return NextResponse.json(
        { error: "Workers can only be added for the signed-in subcontractor." },
        { status: 403 }
      );
    }
    if (!firstName || !lastName || !email || !phone || !trade) {
      return NextResponse.json(
        { error: "First name, last name, email, phone, and trade are required." },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (!whiteCardUrl || !silicaUrl) {
      return NextResponse.json(
        { error: "White Card and Silica Certificate uploads are required." },
        { status: 400 }
      );
    }
    if (!organisationId) {
      return NextResponse.json(
        { error: "Select an organisation before adding a worker." },
        { status: 400 }
      );
    }

    const names = buildWorkerNameFields(firstName, lastName);
    const inviteToken = createInviteToken();
    const payload = stampOrganisationId(
      {
        first_name: names.first_name,
        last_name: names.last_name,
        full_name: names.full_name,
        worker_name: names.worker_name,
        email,
        phone,
        trade,
        worker_type: trade,
        subcontractor_id: subcontractorId,
        is_subcontractor: true,
        worker_category: HIRED_LABOUR_CATEGORY,
        hired_labour_status: "invited",
        onboarding_completed: false,
        white_card_provided: true,
        silica_cert_provided: true,
        status: "pending_induction",
        security_role: DEFAULT_WORKER_SECURITY_ROLE,
        invite_status: "pending",
        invite_token: inviteToken,
        white_card_url: whiteCardUrl,
        white_card_doc_url: whiteCardUrl,
        white_card_photo_url: whiteCardUrl,
        white_card_file_url: whiteCardUrl,
        silica_url: silicaUrl,
        silica_cert_url: silicaUrl,
        silica_cert_doc_url: silicaUrl,
        silica_cert_photo_url: silicaUrl,
      },
      organisationId
    );

    const inserted = await insertWithMissingColumnRetry("workers", payload, "id");
    if (inserted.error || !inserted.data?.id) {
      return NextResponse.json(
        { error: inserted.error ?? "Failed to create worker." },
        { status: 500 }
      );
    }

    const workerId = String(inserted.data.id);
    const admin = createSupabaseAdminClient();
    const prepared = await ensureWorkerInviteRecord(admin, {
      email,
      workerId,
      firstName,
      lastName,
    });
    if (prepared.error || !prepared.workerId) {
      return NextResponse.json(
        {
          error: prepared.error ?? "Worker saved, but the invite record could not be prepared.",
          inviteError: prepared.error ?? "Failed to prepare worker invite.",
          id: workerId,
        },
        { status: 500 }
      );
    }

    const sent = await sendWorkerInviteEmailViaResend(email, {
      workerId: prepared.workerId,
    });
    if (!sent.success) {
      return NextResponse.json({
        success: false,
        id: workerId,
        inviteSent: false,
        inviteError: sent.error ?? "Failed to send invitation email.",
        error: sent.error ?? "Failed to send invitation email.",
      });
    }

    return NextResponse.json({
      success: true,
      id: workerId,
      inviteSent: true,
    });
  } catch (error) {
    console.error("[subcontractor-workers] Create route failed", error);
    return NextResponse.json(
      {
        error: errorMessage(error, "Failed to add worker."),
      },
      { status: 500 }
    );
  }
}
