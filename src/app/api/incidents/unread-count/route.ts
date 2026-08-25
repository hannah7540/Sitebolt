export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  formatIncidentTableError,
  fromIncidentReports,
  INCIDENT_REPORTS_TABLE,
  logIncidentSupabaseError,
} from "@/lib/incident-reports";

export async function GET() {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const { count, error } = await fromIncidentReports(access.admin)
    .select("id", { count: "exact", head: true })
    .eq("is_read_admin", false);

  if (error) {
    logIncidentSupabaseError("unread count failed", error);
    return NextResponse.json(
      { error: formatIncidentTableError(error), count: 0 },
      { status: 400 }
    );
  }

  return NextResponse.json({ count: count ?? 0 });
}
