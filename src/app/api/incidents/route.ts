export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { after, NextResponse } from "next/server";
import { requireAuthenticatedWorkerAccess, requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  buildIncidentInsertPayload,
  forceIncidentBoolean,
  formatIncidentTableError,
  fromIncidentReports,
  generateIncidentReferenceNumber,
  insertIncidentReportRow,
  isValidIncidentUuid,
  logIncidentSupabaseError,
  normalizeIncidentReport,
  nullIfBlankUuid,
  sanitizeIncidentTreatment,
  sanitizeTextArray,
  sanitizeUuidArray,
  INCIDENT_REPORTS_TABLE,
  type IncidentReportSubmitInput,
} from "@/lib/incident-reports";
import { sendIncidentNotificationEmails } from "@/lib/incident-report-notifications";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveProjectUuid(
  admin: SupabaseClient,
  projectIdOrSlug: string
): Promise<{ id: string | null; name: string | null }> {
  const trimmed = projectIdOrSlug.trim();
  if (!trimmed) return { id: null, name: null };

  const { data, error } = await admin
    .from("projects")
    .select("id, project_name, slug")
    .or(`id.eq.${trimmed},slug.eq.${trimmed}`)
    .maybeSingle();

  if (error || !data?.id) {
    return { id: null, name: null };
  }

  return {
    id: String(data.id),
    name: data.project_name ? String(data.project_name) : null,
  };
}

export async function GET() {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const { data, error } = await fromIncidentReports(access.admin)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    logIncidentSupabaseError("GET incident_reports failed", error);
    return NextResponse.json(
      { error: formatIncidentTableError(error), reports: [], count: 0 },
      { status: 400 }
    );
  }

  const reports = ((data ?? []) as Record<string, unknown>[]).map((row) =>
    normalizeIncidentReport(row)
  );
  return NextResponse.json({ reports, count: reports.length });
}

export async function POST(req: Request) {
  const access = await requireAuthenticatedWorkerAccess();
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const projectKey = readString(raw.projectId);
  if (!projectKey) {
    return NextResponse.json(
      { error: "Please select a project before submitting." },
      { status: 400 }
    );
  }

  const resolvedProject = await resolveProjectUuid(access.admin, projectKey);
  const projectId = resolvedProject.id ?? (isValidIncidentUuid(projectKey) ? projectKey : null);
  if (!projectId || !isValidIncidentUuid(projectId)) {
    return NextResponse.json(
      {
        error:
          "Selected project could not be resolved to a valid project UUID. Please select a project and try again.",
      },
      { status: 400 }
    );
  }

  const signatureUrl = readString(raw.submitterSignatureUrl);
  // Storage URL preferred; data: URLs allowed as offline/upload failure fallback.
  if (!signatureUrl) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }

  const input: IncidentReportSubmitInput = {
    submittedById: access.workerId,
    submittedByName:
      readString(raw.submittedByName) ||
      getWorkerDisplayName(access.worker, "Worker"),
    incidentDateTime: readString(raw.incidentDateTime),
    projectId,
    projectName:
      readString(raw.projectName) || resolvedProject.name || "Project",
    injuredWorkerId: nullIfBlankUuid(raw.injuredWorkerId),
    injuredWorkerName: readString(raw.injuredWorkerName) || null,
    injuryDetails: readString(raw.injuryDetails) || null,
    treatmentDetails: sanitizeIncidentTreatment(raw.treatmentDetails),
    treatingPersonId: nullIfBlankUuid(raw.treatingPersonId),
    treatingPersonName: readString(raw.treatingPersonName) || null,
    offsiteTreatmentLocation: readString(raw.offsiteTreatmentLocation) || null,
    whatOccurred: readString(raw.whatOccurred),
    incidentLocationDetails: readString(raw.incidentLocationDetails),
    treatmentGiven: readString(raw.treatmentGiven) || null,
    witnessIds: sanitizeUuidArray(raw.witnessIds ?? []),
    witnessNames: sanitizeTextArray(raw.witnessNames ?? []),
    immediateCorrectiveActionRequired: forceIncidentBoolean(
      raw.immediateCorrectiveActionRequired
    ),
    isNotifiableUnderWhs: forceIncidentBoolean(raw.isNotifiableUnderWhs),
    whatCausedToGoWrong: readString(raw.whatCausedToGoWrong) || null,
    whatCouldHavePrevented: readString(raw.whatCouldHavePrevented) || null,
    recommendationsToPrevent: readString(raw.recommendationsToPrevent) || null,
    medicalCertificateUrls: sanitizeTextArray(raw.medicalCertificateUrls ?? []),
    submitterSignatureUrl: signatureUrl,
  };

  if (!input.incidentDateTime) {
    return NextResponse.json({ error: "Incident date and time is required." }, { status: 400 });
  }
  if (!input.injuredWorkerId) {
    return NextResponse.json({ error: "Injured worker is required." }, { status: 400 });
  }
  if (!input.whatOccurred) {
    return NextResponse.json({ error: "What occurred is required." }, { status: 400 });
  }
  if (!input.incidentLocationDetails) {
    return NextResponse.json(
      { error: "Incident location details are required." },
      { status: 400 }
    );
  }

  const referenceNumber = await generateIncidentReferenceNumber(access.admin);
  const payload = buildIncidentInsertPayload(input, referenceNumber);

  // Direct insert into public.incident_reports (schema-scrubbed column keys only).
  const inserted = await insertIncidentReportRow(access.admin, payload);
  if (inserted.error || !inserted.report) {
    console.error("[api/incidents] insert failed:", inserted.error);
    return NextResponse.json(
      {
        error: inserted.error ?? "Failed to insert incident report.",
        table: INCIDENT_REPORTS_TABLE,
      },
      { status: 400 }
    );
  }

  const report = inserted.report;

  // Never block form success on email delivery — queue in background.
  after(() => {
    void sendIncidentNotificationEmails(access.admin, report).catch((cause) => {
      console.warn(
        "[incidents] background email dispatch failed:",
        cause instanceof Error ? cause.message : cause
      );
    });
  });

  return NextResponse.json({
    success: true,
    table: INCIDENT_REPORTS_TABLE,
    report,
    emailQueued: true,
  });
}
