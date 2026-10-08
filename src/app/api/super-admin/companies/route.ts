export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { isSuperAdminAccount } from "@/lib/super-admin";
import {
  COMPANY_MODULE_OPTIONS,
  COMPANY_STATE_OPTIONS,
  mergeWorkspaceCompanies,
  type WorkspaceCompany,
} from "@/lib/organisation-workspace";
import { A_PLUS_ORGANISATION_ID } from "@/lib/active-organisation";
import {
  flagsFromLegacyModules,
  parseOrganisationFeatureFlags,
  parseOperatingStates,
  serializeOrganisationFeatureFlags,
} from "@/lib/organisation-feature-flags";

async function requireSuperAdmin() {
  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Admin client is not configured." }, { status: 503 }),
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
  let workerFlag: boolean | null = null;
  const { data: workerRow } = await admin
    .from("workers")
    .select("is_super_admin")
    .ilike("email", user.email ?? "")
    .maybeSingle();

  if (workerRow && typeof (workerRow as { is_super_admin?: boolean }).is_super_admin === "boolean") {
    workerFlag = (workerRow as { is_super_admin?: boolean }).is_super_admin ?? null;
  }

  if (
    !isSuperAdminAccount({
      email: user.email,
      metadata: user.user_metadata as Record<string, unknown>,
      isSuperAdminFlag: workerFlag,
    })
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, admin };
}

function mapOrganisationRow(row: Record<string, unknown>): WorkspaceCompany {
  const id = String(row.id ?? "");
  return {
    id,
    company_name: String(row.company_name ?? row.name ?? "").trim(),
    is_demo: row.is_demo === true,
    state: typeof row.state === "string" ? row.state : null,
    feature_flags: parseOrganisationFeatureFlags(
      row.feature_flags,
      id,
      typeof row.state === "string" ? row.state : null
    ),
  };
}

export async function GET() {
  const access = await requireSuperAdmin();
  if (!access.ok) return access.response;

  const selectVariants = [
    "id, company_name, name, is_demo, state, feature_flags",
    "id, company_name, is_demo, state, feature_flags",
    "id, company_name, name, is_demo, state",
    "id, company_name, is_demo, state",
    "id, company_name, name, state",
    "id, company_name, state",
    "id, company_name, name",
    "id, company_name",
    "id, name",
  ];

  for (const select of selectVariants) {
    const { data, error } = await access.admin.from("organisations").select(select);
    if (error) continue;
    const rows = ((data ?? []) as unknown as Record<string, unknown>[])
      .map(mapOrganisationRow)
      .filter((row) => row.id);
    return NextResponse.json({ companies: mergeWorkspaceCompanies(rows) });
  }

  return NextResponse.json({ companies: mergeWorkspaceCompanies([]) });
}

export async function POST(request: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const companyName = String(record.companyName ?? record.company_name ?? "").trim();
  const rawModules = Array.isArray(record.modules) ? record.modules.map(String) : [];
  const allowedModules = new Set<string>(COMPANY_MODULE_OPTIONS.map((item) => item.id));
  const modules = rawModules.filter((item) => allowedModules.has(item));
  const rawFlags = record.featureFlags ?? record.feature_flags;
  const parsedFlags = rawFlags
    ? parseOrganisationFeatureFlags(rawFlags)
    : flagsFromLegacyModules(modules);
  const operatingStates = parseOperatingStates(
    record.operatingStates ?? record.operating_states ?? parsedFlags.operating_states,
    typeof record.state === "string" ? record.state : null
  );
  const featureFlags = serializeOrganisationFeatureFlags({
    ...parsedFlags,
    operating_states: operatingStates,
  });
  const state = operatingStates[0] ?? "";

  if (!companyName) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }
  if (operatingStates.length === 0) {
    return NextResponse.json(
      { error: "Select at least one operating jurisdiction." },
      { status: 400 }
    );
  }

  const payloads: Record<string, unknown>[] = [
    {
      company_name: companyName,
      state,
      enabled_modules: modules,
      feature_flags: featureFlags,
      is_demo: false,
    },
    { company_name: companyName, state, feature_flags: featureFlags, is_demo: false },
    { company_name: companyName, state, enabled_modules: modules, is_demo: false },
    { company_name: companyName, state, is_demo: false },
    { company_name: companyName, state },
    { company_name: companyName },
  ];

  const insertSelects = [
    "id, company_name, state, is_demo, feature_flags",
    "id, company_name, state, is_demo",
    "id, company_name",
  ];

  for (const payload of payloads) {
    for (const select of insertSelects) {
      const { data, error } = await access.admin
        .from("organisations")
        .insert([payload])
        .select(select)
        .maybeSingle();

      if (error || !data) continue;
      const row = data as unknown as Record<string, unknown>;
      return NextResponse.json({
        company: mapOrganisationRow({
          ...row,
          feature_flags: row.feature_flags ?? featureFlags,
        }),
        states: COMPANY_STATE_OPTIONS,
      });
    }
  }

  return NextResponse.json(
    { error: "Unable to create the company workspace." },
    { status: 500 }
  );
}

export async function PATCH(request: Request) {
  const access = await requireSuperAdmin();
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const id = String(record.id ?? record.organisation_id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Company id is required." }, { status: 400 });
  }

  if (id === A_PLUS_ORGANISATION_ID) {
    const { data } = await access.admin
      .from("organisations")
      .select("id, company_name, state, is_demo, feature_flags")
      .eq("id", id)
      .maybeSingle();
    const row = (data as unknown as Record<string, unknown> | null) ?? {};
    return NextResponse.json({
      company: mapOrganisationRow({
        ...row,
        id,
        company_name: String(row.company_name ?? "A Plus Plumbing (ACT) PTY LTD"),
        feature_flags: row.feature_flags,
        state: row.state ?? "ACT",
      }),
    });
  }

  const parsedFlags = parseOrganisationFeatureFlags(
    record.featureFlags ?? record.feature_flags,
    id,
    typeof record.state === "string" ? record.state : null
  );
  const operatingStates = parseOperatingStates(
    record.operatingStates ?? record.operating_states ?? parsedFlags.operating_states,
    typeof record.state === "string" ? record.state : null
  );
  const featureFlags = serializeOrganisationFeatureFlags(
    { ...parsedFlags, operating_states: operatingStates },
    id
  );
  const primaryState = operatingStates[0] ?? null;
  if (operatingStates.length === 0) {
    return NextResponse.json(
      { error: "Select at least one operating jurisdiction." },
      { status: 400 }
    );
  }

  const selectVariants = [
    "id, company_name, state, is_demo, feature_flags",
    "id, company_name, feature_flags",
    "id, company_name",
  ];

  for (const select of selectVariants) {
    const payload: Record<string, unknown> = {};
    if (select.includes("feature_flags")) payload.feature_flags = featureFlags;
    if (select.includes("state") && primaryState) payload.state = primaryState;
    if (Object.keys(payload).length === 0) break;
    const { data, error } = await access.admin
      .from("organisations")
      .update(payload)
      .eq("id", id)
      .select(select)
      .maybeSingle();
    if (error || !data) continue;
    return NextResponse.json({
      company: mapOrganisationRow(data as unknown as Record<string, unknown>),
    });
  }

  return NextResponse.json(
    { error: "Unable to update company configuration." },
    { status: 500 }
  );
}
