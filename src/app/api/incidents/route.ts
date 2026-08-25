export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAuthenticatedWorkerAccess, requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  buildIncidentInsertPayload,
  generateIncidentReferenceNumber,
  normalizeIncidentReport,
  INCIDENT_REPORTS_TABLE,
  type IncidentReportSubmitInput,
  type IncidentTreatmentDetails,
} from "@/lib/incident-reports";
import { sendIncidentNotificationEmails } from "@/lib/incident-report-notifications";
import { getWorkerDisplayName } from "@/lib/worker-utils";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export async function GET() {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from(INCIDENT_REPORTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
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
  const input: IncidentReportSubmitInput = {
    submittedById: access.workerId,
    submittedByName:
      readString(raw.submittedByName) ||
      getWorkerDisplayName(access.worker, "Worker"),
    incidentDateTime: readString(raw.incidentDateTime),
    projectId: readString(raw.projectId),
    projectName: readString(raw.projectName) || "Project",
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
    witnessIds: readStringArray(raw.witnessIds),
    witnessNames: readStringArray(raw.witnessNames),
    immediateCorrectiveActionRequired: readBoolean(raw.immediateCorrectiveActionRequired),
    isNotifiableUnderWhs: readBoolean(raw.isNotifiableUnderWhs),
    whatCausedToGoWrong: readString(raw.whatCausedToGoWrong) || null,
    whatCouldHavePrevented: readString(raw.whatCouldHavePrevented) || null,
    recommendationsToPrevent: readString(raw.recommendationsToPrevent) || null,
    medicalCertificateUrls: readStringArray(raw.medicalCertificateUrls),
    submitterSignatureUrl: readString(raw.submitterSignatureUrl),
  };

  if (!input.incidentDateTime) {
    return NextResponse.json({ error: "Incident date and time is required." }, { status: 400 });
  }
  if (!input.projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
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

  const referenceNumber = await generateIncidentReferenceNumber(access.admin);
  const payload = buildIncidentInsertPayload(input, referenceNumber);

  const { data, error } = await access.admin
    .from(INCIDENT_REPORTS_TABLE)
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
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
