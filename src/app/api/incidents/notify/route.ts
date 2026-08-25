export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { after, NextResponse } from "next/server";
import { requireAuthenticatedWorkerAccess } from "@/lib/swms-api-auth";
import {
  formatIncidentTableError,
  fromIncidentReports,
  INCIDENT_REPORTS_TABLE,
  logIncidentSupabaseError,
  normalizeIncidentReport,
} from "@/lib/incident-reports";
import { sendIncidentNotificationEmails } from "@/lib/incident-report-notifications";

export async function POST(req: Request) {
  const access = await requireAuthenticatedWorkerAccess();
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const reportId =
    body && typeof body === "object" && "reportId" in body
      ? String((body as { reportId?: unknown }).reportId ?? "").trim()
      : "";

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required." }, { status: 400 });
  }

  const { data, error } = await fromIncidentReports(access.admin)
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    logIncidentSupabaseError("notify fetch incident_reports failed", error);
    return NextResponse.json(
      { error: formatIncidentTableError(error), table: INCIDENT_REPORTS_TABLE },
      { status: 400 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Incident report not found." }, { status: 404 });
  }

  const report = normalizeIncidentReport(data as Record<string, unknown>);

  after(() => {
    void sendIncidentNotificationEmails(access.admin, report).catch((cause) => {
      console.warn(
        "[incidents/notify] background email dispatch failed:",
        cause instanceof Error ? cause.message : cause
      );
    });
  });

  return NextResponse.json({ success: true, emailQueued: true });
}
