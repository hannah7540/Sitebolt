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

function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

async function persistInviteToken(input: {
  token: string;
  expiresAt: string;
  subcontractorId?: string;
  email?: string;
}): Promise<{ error: string | null }> {
  const client = isSupabaseAdminConfigured()
    ? createSupabaseAdminClient()
    : await createSupabaseServerClient();

  let payload: Record<string, unknown> = {
    invite_token: input.token,
    invite_expires_at: input.expiresAt,
  };

  for (let attempt = 0; attempt < 8; attempt += 1) {
    let query = client.from("subcontractors").update(payload);
    if (input.subcontractorId) {
      query = query.eq("id", input.subcontractorId);
    } else if (input.email) {
      query = query.or(`email.eq.${input.email},contact_email.eq.${input.email}`);
    } else {
      return { error: "Subcontractor id or email is required to store the invite token." };
    }

    const { error } = await query;
    if (!error) return { error: null };

    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload) {
      console.warn("[subcontractor-invite] Missing column while persisting token", missing);
      payload = stripMissingColumn(payload, missing);
      continue;
    }

    return { error: error.message };
  }

  return { error: "Could not store the onboarding invite token." };
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to send invitations." }, { status: 401 });
    }

    const body = (await request.json()) as {
      email?: string;
      companyName?: string;
      contactName?: string;
      subcontractorId?: string;
      token?: string;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
    const subcontractorId =
      typeof body.subcontractorId === "string" ? body.subcontractorId.trim() : "";
    const providedToken = typeof body.token === "string" ? body.token.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const token = /^[a-f0-9]{64}$/i.test(providedToken)
      ? providedToken
      : createInviteToken();
    const expiresAt = new Date(Date.now() + SUBCONTRACTOR_INVITE_TTL_MS).toISOString();
    const persisted = await persistInviteToken({
      token,
      expiresAt,
      subcontractorId: subcontractorId || undefined,
      email,
    });

    if (persisted.error) {
      console.error("[subcontractor-invite] Failed to persist invite token", persisted.error);
    }

    const sent = await sendSubcontractorInviteEmail({
      email,
      companyName,
      contactName,
      token,
    });

    if (!sent.success) {
      return NextResponse.json(
        { error: sent.error ?? "Failed to send invitation email." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tokenPersisted: !persisted.error,
    });
  } catch (error) {
    console.error("[subcontractor-invite] Invite route failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send invitation email.",
      },
      { status: 500 }
    );
  }
}
