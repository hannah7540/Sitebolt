export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  formatIncidentTableError,
  INCIDENT_REPORTS_TABLE,
  normalizeIncidentReport,
  INCIDENT_STATUS_OPTIONS,
  type IncidentStatus,
} from "@/lib/incident-reports";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const { id } = await context.params;
  const incidentId = id?.trim();
  if (!incidentId) {
    return NextResponse.json({ error: "Incident id is required." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof raw.is_read_admin === "boolean") {
    payload.is_read_admin = raw.is_read_admin;
  }

  if (typeof raw.status === "string") {
    const status = raw.status.trim() as IncidentStatus;
    if (!(INCIDENT_STATUS_OPTIONS as readonly string[]).includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    payload.status = status;
    if (status !== "new") {
      payload.is_read_admin = true;
    }
  }

  const { data, error } = await access.admin
    .from(INCIDENT_REPORTS_TABLE)
    .update(payload)
    .eq("id", incidentId)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { error: formatIncidentTableError(error), table: INCIDENT_REPORTS_TABLE },
      { status: 400 }
    );
  }

  return NextResponse.json({
    report: normalizeIncidentReport(data as Record<string, unknown>),
  });
}
