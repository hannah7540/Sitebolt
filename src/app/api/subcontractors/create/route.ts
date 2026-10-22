export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { parseMissingColumnFromError, stripMissingColumn } from "@/lib/form-payload-utils";
import {
  sendSubcontractorInviteEmail,
  SUBCONTRACTOR_INVITE_TTL_MS,
} from "@/lib/subcontractor-invite-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveActiveOrganisationIdFromRequest,
  stampOrganisationId,
} from "@/lib/tenant-scope";

const INVITE_STATES = new Set(["WA", "NZ", "ACT", "NSW"]);

function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function insertWithMissingColumnRetry(
  table: string,
  payload: Record<string, unknown>,
  select = "id"
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const admin = createSupabaseAdminClient();
  let current = { ...payload };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await admin.from(table).insert(current).select(select).single();
    if (!error) {
      return { data: (data as unknown as Record<string, unknown> | null) ?? null, error: null };
    }
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { data: null, error: error.message };
  }
  return { data: null, error: `Could not insert into ${table}.` };
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to add a subcontractor." }, { status: 401 });
    }

    const orgId = resolveActiveOrganisationIdFromRequest(request);
    if (!orgId) {
      return NextResponse.json(
        { error: "Select an organisation before inviting a subcontractor." },
        { status: 400 }
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
      companyName?: string;
      contactName?: string;
      email?: string;
      state?: string;
      projectIds?: unknown;
    };

    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const state = typeof body.state === "string" ? body.state.trim().toUpperCase() : "";
    const projectIds = Array.from(
      new Set(
        (Array.isArray(body.projectIds) ? body.projectIds : [])
          .map((id) => String(id ?? "").trim())
          .filter(Boolean)
      )
    );

    if (!companyName) {
      return NextResponse.json({ error: "Company name is required." }, { status: 400 });
    }
    if (!contactName) {
      return NextResponse.json({ error: "Contact person name is required." }, { status: 400 });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    if (!INVITE_STATES.has(state)) {
      return NextResponse.json({ error: "State is required." }, { status: 400 });
    }
    if (projectIds.length === 0) {
      return NextResponse.json({ error: "Assign at least one project." }, { status: 400 });
    }

    // Service-role client bypasses RLS for create, token, and project assignment.
    // Credentials: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
    const admin = createSupabaseAdminClient();
    const token = createInviteToken();
    const expiresAt = new Date(Date.now() + SUBCONTRACTOR_INVITE_TTL_MS).toISOString();

    const payload = stampOrganisationId(
      {
        company_name: companyName,
        contact_name: contactName,
        contact_person: contactName,
        contact_email: email,
        email,
        state,
        status: "invited",
        notes: `State: ${state}`,
        invite_token: token,
        invite_expires_at: expiresAt,
      },
      orgId
    );

    const inserted = await insertWithMissingColumnRetry("subcontractors", payload, "id");
    if (inserted.error || !inserted.data?.id) {
      return NextResponse.json(
        { error: inserted.error ?? "Failed to create subcontractor." },
        { status: 500 }
      );
    }

    const subcontractorId = String(inserted.data.id);
    const linkRows = projectIds.map((projectId) =>
      stampOrganisationId(
        {
          project_id: projectId,
          subcontractor_id: subcontractorId,
        },
        orgId
      )
    );

    let assignPayload: Record<string, unknown>[] = linkRows;
    let assignError: string | null = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await admin.from("project_subcontractors").insert(assignPayload);
      if (!error) {
        assignError = null;
        break;
      }
      const missing = parseMissingColumnFromError(error.message);
      if (missing && assignPayload.some((row) => missing in row)) {
        assignPayload = assignPayload.map((row) => stripMissingColumn(row, missing));
        continue;
      }
      assignError = error.message;
      break;
    }

    if (assignError) {
      return NextResponse.json(
        {
          error: `Subcontractor saved, but project assignments failed: ${assignError}`,
          id: subcontractorId,
          inviteError: assignError,
        },
        { status: 500 }
      );
    }

    const sent = await sendSubcontractorInviteEmail({
      email,
      companyName,
      contactName,
      token,
    });

    if (!sent.success) {
      return NextResponse.json({
        success: false,
        id: subcontractorId,
        inviteSent: false,
        inviteError: sent.error ?? "Failed to send invitation email.",
        error: sent.error ?? "Failed to send invitation email.",
      });
    }

    return NextResponse.json({
      success: true,
      id: subcontractorId,
      inviteSent: true,
    });
  } catch (error) {
    console.error("[subcontractor-create] Create route failed", error);
    return NextResponse.json(
      {
        error: errorMessage(error, "Failed to create subcontractor."),
      },
      { status: 500 }
    );
  }
}
