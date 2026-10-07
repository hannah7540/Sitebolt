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
import { isWorkerStateRegion } from "@/lib/worker-state-region";

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
  return {
    id: String(row.id ?? ""),
    company_name: String(row.company_name ?? row.name ?? "").trim(),
    is_demo: row.is_demo === true,
    state: typeof row.state === "string" ? row.state : null,
  };
}

export async function GET() {
  const access = await requireSuperAdmin();
  if (!access.ok) return access.response;

  const selectVariants = [
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
  const state = String(record.state ?? "").trim().toUpperCase();
  const rawModules = Array.isArray(record.modules) ? record.modules.map(String) : [];
  const allowedModules = new Set<string>(COMPANY_MODULE_OPTIONS.map((item) => item.id));
  const modules = rawModules.filter((item) => allowedModules.has(item));

  if (!companyName) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }
  if (!isWorkerStateRegion(state)) {
    return NextResponse.json({ error: "Select a valid state." }, { status: 400 });
  }

  const payloads: Record<string, unknown>[] = [
    { company_name: companyName, state, enabled_modules: modules, is_demo: false },
    { company_name: companyName, state, is_demo: false },
    { company_name: companyName, state },
    { company_name: companyName },
  ];

  for (const payload of payloads) {
    const { data, error } = await access.admin
      .from("organisations")
      .insert([payload])
      .select("id, company_name")
      .maybeSingle();

    if (error || !data) continue;
    return NextResponse.json({
      company: mapOrganisationRow(data as Record<string, unknown>),
      states: COMPANY_STATE_OPTIONS,
    });
  }

  return NextResponse.json(
    { error: "Unable to create the company workspace." },
    { status: 500 }
  );
}
