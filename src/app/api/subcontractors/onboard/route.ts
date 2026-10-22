export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

const SELECT_BASE =
  "id, company_name, email, contact_email, contact_name, contact_person, status";
const SELECT_WITH_EXPIRY = `${SELECT_BASE}, subcontractor_invite_expire_at`;

function normalizeText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function toRecord(row: Record<string, unknown>, fallbackEmail = "") {
  return {
    id: String(row.id ?? ""),
    company_name: normalizeText(row.company_name) || "your company",
    email: normalizeText(row.email) || normalizeText(row.contact_email) || fallbackEmail,
    contact_name: normalizeText(row.contact_name) || normalizeText(row.contact_person),
  };
}

export async function GET(request: Request) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        { error: "Onboarding lookup is not configured." },
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

    const admin = createSupabaseAdminClient();
    const primary = await admin
      .from("subcontractors")
      .select(SELECT_WITH_EXPIRY)
      .eq("invite_token", token)
      .maybeSingle();

    let data = primary.data;
    let error = primary.error;
    if (error && /subcontractor_invite_expire_at|does not exist|schema cache/i.test(error.message)) {
      const fallback = await admin
        .from("subcontractors")
        .select(SELECT_BASE)
        .eq("invite_token", token)
        .maybeSingle();
      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      console.error("[subcontractor-onboard] Token lookup failed", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "This onboarding link is invalid or has already been used." },
        { status: 404 }
      );
    }

    const row = data as Record<string, unknown>;
    const expiresAt = normalizeText(row.subcontractor_invite_expire_at);
    if (expiresAt && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < Date.now()) {
      return NextResponse.json(
        { error: "This onboarding link has expired. Ask the contractor to resend the invite." },
        { status: 410 }
      );
    }

    return NextResponse.json({ record: toRecord(row) });
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
