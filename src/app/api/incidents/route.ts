export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAuthenticatedWorkerAccess, requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  buildIncidentInsertPayload,
  formatIncidentTableError,
  generateIncidentReferenceNumber,
  normalizeIncidentReport,
  sanitizeTextArray,
  sanitizeUuidArray,
  INCIDENT_REPORTS_TABLE,
  type IncidentReportSubmitInput,
  type IncidentTreatmentDetails,
} from "@/lib/incident-reports";
import { INCIDENT_ATTACHMENTS_BUCKET } from "@/lib/incident-report-upload";
import { sendIncidentNotificationEmails } from "@/lib/incident-report-notifications";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
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

  const { data, error } = await access.admin
    .from(INCIDENT_REPORTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: formatIncidentTableError(error), reports: [], count: 0 },
      { status: 400 }
    );
  }

  const reports = ((data ?? []) as Record<string, unknown>[]).map(normalizeIncidentReport);
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
  const treatmentDetails = readString(raw.treatmentDetails) as IncidentTreatmentDetails;
  const projectKey = readString(raw.projectId);
  const resolvedProject = await resolveProjectUuid(access.admin, projectKey);

  const input: IncidentReportSubmitInput = {
    submittedById: access.workerId,
    submittedByName:
      readString(raw.submittedByName) ||
      getWorkerDisplayName(access.worker, "Worker"),
    incidentDateTime: readString(raw.incidentDateTime),
    projectId: resolvedProject.id ?? projectKey,
    projectName:
      readString(raw.projectName) || resolvedProject.name || "Project",
    injuredWorkerId: readString(raw.injuredWorkerId) || null,
    injuredWorkerName: readString(raw.injuredWorkerName) || null,
    injuryDetails: readString(raw.injuryDetails) || null,
    treatmentDetails: treatmentDetails || "None",
    treatingPersonId: readString(raw.treatingPersonId) || null,
    treatingPersonName: readString(raw.treatingPersonName) || null,
    offsiteTreatmentLocation: readString(raw.offsiteTreatmentLocation) || null,
    whatOccurred: readString(raw.whatOccurred),
    incidentLocationDetails: readString(raw.incidentLocationDetails),
    treatmentGiven: readString(raw.treatmentGiven) || null,
    witnessIds: sanitizeUuidArray(raw.witnessIds),
    witnessNames: sanitizeTextArray(raw.witnessNames),
    immediateCorrectiveActionRequired: readBoolean(raw.immediateCorrectiveActionRequired),
    isNotifiableUnderWhs: readBoolean(raw.isNotifiableUnderWhs),
    whatCausedToGoWrong: readString(raw.whatCausedToGoWrong) || null,
    whatCouldHavePrevented: readString(raw.whatCouldHavePrevented) || null,
    recommendationsToPrevent: readString(raw.recommendationsToPrevent) || null,
    medicalCertificateUrls: sanitizeTextArray(raw.medicalCertificateUrls),
    submitterSignatureUrl: readString(raw.submitterSignatureUrl),
  };

  if (!input.incidentDateTime) {
    return NextResponse.json({ error: "Incident date and time is required." }, { status: 400 });
  }
  if (!input.projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
  }
  if (!resolvedProject.id) {
    return NextResponse.json(
      {
        error:
          "Selected project could not be resolved to a valid project UUID for incident_reports.project_id.",
      },
      { status: 400 }
    );
  }
  input.projectId = resolvedProject.id;

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
  if (!input.submitterSignatureUrl) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }
  if (input.submitterSignatureUrl.startsWith("data:")) {
    return NextResponse.json(
      {
        error: `Signature must be uploaded to the \`${INCIDENT_ATTACHMENTS_BUCKET}\` bucket before submit.`,
      },
      { status: 400 }
    );
  }

  const referenceNumber = await generateIncidentReferenceNumber(access.admin);
  const payload = buildIncidentInsertPayload(input, referenceNumber);

  const { data, error } = await access.admin
    .from(INCIDENT_REPORTS_TABLE)
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      {
        error: formatIncidentTableError(error),
        table: INCIDENT_REPORTS_TABLE,
      },
      { status: 400 }
    );
  }

  const report = normalizeIncidentReport(data as Record<string, unknown>);

  let emailSent = false;
  let emailError: string | undefined;
  try {
    const emailResult = await sendIncidentNotificationEmails(access.admin, report);
    emailSent = emailResult.sent;
    emailError = emailResult.error;
  } catch (cause) {
    emailError = cause instanceof Error ? cause.message : "Failed to send notification email.";
  }

  return NextResponse.json({
    success: true,
    report,
    emailSent,
    emailError,
  });
}
