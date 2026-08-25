export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  INCIDENT_REPORTS_TABLE,
  isIncidentUnread,
  normalizeIncidentReport,
} from "@/lib/incident-reports";

export async function GET() {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from(INCIDENT_REPORTS_TABLE)
    .select("id, is_read_admin, status");

  if (error) {
    return NextResponse.json({ error: error.message, count: 0 }, { status: 400 });
  }

  const count = ((data ?? []) as Record<string, unknown>[])
    .map(normalizeIncidentReport)
    .filter(isIncidentUnread).length;

  return NextResponse.json({ count });
}
