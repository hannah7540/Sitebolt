import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { canManageOrganisation, normalizeSecurityRole } from "@/lib/security-roles";
import {
  buildDefaultOrganisationRecord,
  DEFAULT_ORGANISATION_ID,
  mapOrganisationResponse,
  normalizeOrganisationSavePayload,
  ORGANISATION_SELECT_FIELDS,
  type OrganisationRow,
} from "@/lib/organisation-api";

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

async function fetchOrCreateOrganisation(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<{ data: OrganisationRow | null; error: string | null }> {
  const { data: existing, error: fetchError } = await admin
    .from("organisations")
    .select(ORGANISATION_SELECT_FIELDS)
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    return { data: null, error: fetchError.message };
  }

  if (existing) {
    return { data: existing as OrganisationRow, error: null };
  }

  const defaultRecord = buildDefaultOrganisationRecord();
  const { data: inserted, error: insertError } = await admin
    .from("organisations")
    .insert([defaultRecord])
    .select(ORGANISATION_SELECT_FIELDS)
    .single();

  if (insertError) {
    return { data: null, error: insertError.message };
  }

  return { data: inserted as OrganisationRow, error: null };
}

async function saveOrganisation(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  body: Record<string, unknown>
): Promise<{ data: OrganisationRow | null; error: string | null }> {
  const updatePayload = normalizeOrganisationSavePayload(body);
  const existingResult = await fetchOrCreateOrganisation(admin);

  if (existingResult.error) {
    return { data: null, error: existingResult.error };
  }

  const existing = existingResult.data;
  if (!existing?.id) {
    const { data, error } = await admin
      .from("organisations")
      .insert([{ id: DEFAULT_ORGANISATION_ID, ...updatePayload }])
      .select(ORGANISATION_SELECT_FIELDS)
      .single();

    console.log("Supabase Organisation Save Result:", data, error);
    if (error) {
      return { data: null, error: error.message };
    }
    return { data: data as OrganisationRow, error: null };
  }

  const { data, error } = await admin
    .from("organisations")
    .update(updatePayload)
    .eq("id", existing.id)
    .select(ORGANISATION_SELECT_FIELDS)
    .single();

  console.log("Supabase Organisation Save Result:", data, error);
  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as OrganisationRow, error: null };
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
    const result = await fetchOrCreateOrganisation(admin);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: mapOrganisationResponse(result.data as OrganisationRow),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load organisation.",
      },
      { status: 500 }
    );
  }
}

async function handleSave(request: Request) {
  const auth = await requireOrganisationWriteAccess();
  if (!auth.ok) return auth.response;

  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const result = await saveOrganisation(auth.admin, body);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: mapOrganisationResponse(result.data as OrganisationRow),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save organisation.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleSave(request);
}

export async function PUT(request: Request) {
  return handleSave(request);
}
