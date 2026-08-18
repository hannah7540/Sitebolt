import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { canManageOrganisation, normalizeSecurityRole } from "@/lib/security-roles";
import {
  deleteInsuranceRecords,
  insertInsuranceRecords,
  listInsuranceRecords,
  mapCompanyInsuranceResponse,
  sanitizeInsuranceSavePayload,
  updateInsuranceRecords,
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
        { success: false, error: "Server admin client is not configured." },
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
      response: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
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
      response: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      ),
    };
  }

  return { ok: true as const, admin };
}

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server admin client is not configured." },
      { status: 503 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await listInsuranceRecords(admin);
    if (result.error) {
      console.error("Insurance Load Error:", result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data.map((row) =>
        mapCompanyInsuranceResponse(row as CompanyInsuranceRow)
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load insurances.";
    console.error("Insurance Load Error:", error);
    return NextResponse.json(
      { success: false, error: message },
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
      return NextResponse.json(
        { success: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const sanitizedRecord = sanitizeInsuranceSavePayload(body);

    if (!sanitizedRecord.start_date) {
      return NextResponse.json(
        { success: false, error: "Start date is required." },
        { status: 400 }
      );
    }
    if (!sanitizedRecord.expiry_date) {
      return NextResponse.json(
        { success: false, error: "Expiry date is required." },
        { status: 400 }
      );
    }

    const id = method === "PUT" ? String(body.id ?? "").trim() : "";
    if (method === "PUT" && !id) {
      return NextResponse.json(
        { success: false, error: "Insurance id is required." },
        { status: 400 }
      );
    }

    const result =
      method === "PUT"
        ? await updateInsuranceRecords(auth.admin, id, sanitizedRecord)
        : await insertInsuranceRecords(auth.admin, sanitizedRecord);

    if (result.error || !result.data) {
      console.error("Insurance Save Error:", result.error);
      return NextResponse.json(
        {
          success: false,
          error: result.error ?? "Failed to save insurance policy.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: mapCompanyInsuranceResponse(result.data as CompanyInsuranceRow),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save insurance.";
    console.error("Insurance Save Error:", error);
    return NextResponse.json(
      { success: false, error: message },
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

export async function DELETE(request: Request) {
  const auth = await requireOrganisationWriteAccess();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body.id ?? new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Insurance id is required." },
        { status: 400 }
      );
    }

    const result = await deleteInsuranceRecords(auth.admin, id);
    if (result.error) {
      console.error("Insurance Delete Error:", result.error);
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete insurance.";
    console.error("Insurance Delete Error:", error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
