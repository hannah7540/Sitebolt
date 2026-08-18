import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { canManageOrganisation, normalizeSecurityRole } from "@/lib/security-roles";
import {
  INSURANCE_SELECT_FIELDS,
  mapCompanyInsuranceResponse,
  normalizeCompanyInsuranceSavePayload,
  type CompanyInsuranceRow,
} from "@/lib/organisation-insurances-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function requireOrganisationWriteAccess() {
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Server admin client is not configured." },
        { status: 503 }
      ),
    };
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createSupabaseAdminClient();
  const { data: workerRow } = await admin
    .from("workers")
    .select("id, security_role")
    .eq("email", user.email ?? "")
    .maybeSingle();

  const role = normalizeSecurityRole(
    (workerRow as { security_role?: string } | null)?.security_role
  );

  if (!canManageOrganisation(role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, admin };
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server admin client is not configured." },
      { status: 503 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("company_insurances")
      .select(INSURANCE_SELECT_FIELDS)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: (data ?? []).map((row) =>
        mapCompanyInsuranceResponse(row as CompanyInsuranceRow)
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load insurances.",
      },
      { status: 500 }
    );
  }
}

async function handleSave(request: Request, method: "POST" | "PUT") {
  const auth = await requireOrganisationWriteAccess();
  if (!auth.ok) return auth.response;

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const payload = normalizeCompanyInsuranceSavePayload(body);
    if (!payload.insurance_type) {
      return NextResponse.json({ error: "Policy type is required." }, { status: 400 });
    }
    if (!payload.date_obtained) {
      return NextResponse.json({ error: "Start date is required." }, { status: 400 });
    }
    if (!payload.expiry_date) {
      return NextResponse.json({ error: "Expiry date is required." }, { status: 400 });
    }

    const id = method === "PUT" ? String(body.id ?? "").trim() : "";
    if (method === "PUT" && !id) {
      return NextResponse.json({ error: "Insurance id is required." }, { status: 400 });
    }

    if (method === "PUT") {
      const { data, error } = await auth.admin
        .from("company_insurances")
        .update(payload)
        .eq("id", id)
        .select(INSURANCE_SELECT_FIELDS)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: mapCompanyInsuranceResponse(data as CompanyInsuranceRow),
      });
    }

    const { data, error } = await auth.admin
      .from("company_insurances")
      .insert([payload])
      .select(INSURANCE_SELECT_FIELDS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: mapCompanyInsuranceResponse(data as CompanyInsuranceRow),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save insurance.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleSave(request, "POST");
}

export async function PUT(request: Request) {
  return handleSave(request, "PUT");
}
