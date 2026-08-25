import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email-service";
import { getSiteUrl } from "@/lib/supabase/env";
import type { IncidentReportRecord } from "@/lib/incident-reports";
import {
  formatIncidentDateTime,
  incidentStatusLabel,
} from "@/lib/incident-reports";

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const email = value?.trim().toLowerCase();
    if (email && email.includes("@")) set.add(email);
  }
  return [...set];
}

export async function resolveIncidentNotificationEmails(
  admin: SupabaseClient,
  projectId: string | null
): Promise<string[]> {
  const recipientIds = new Set<string>();

  if (projectId) {
    const { data: project } = await admin
      .from("projects")
      .select("id, project_managers, project_administrators, project_admins")
      .or(`id.eq.${projectId},slug.eq.${projectId}`)
      .maybeSingle();

    const managers = Array.isArray(project?.project_managers)
      ? project.project_managers
      : [];
    const admins = Array.isArray(project?.project_administrators)
      ? project.project_administrators
      : Array.isArray(project?.project_admins)
        ? project.project_admins
        : [];

    for (const id of [...managers, ...admins]) {
      if (typeof id === "string" && id.trim()) recipientIds.add(id.trim());
    }
  }

  const { data: globalAdmins } = await admin
    .from("workers")
    .select("id, email, security_role")
    .in("security_role", [
      "full_access",
      "super_admin",
      "owner",
      "project_super_admin",
    ]);

  for (const row of globalAdmins ?? []) {
    if (row?.id) recipientIds.add(String(row.id));
  }

  if (recipientIds.size === 0) {
    return uniqueEmails((globalAdmins ?? []).map((row) => row.email as string | null));
  }

  const { data: workers } = await admin
    .from("workers")
    .select("id, email")
    .in("id", [...recipientIds]);

  return uniqueEmails((workers ?? []).map((row) => row.email as string | null));
}

export function buildIncidentNotificationEmail(report: IncidentReportRecord): {
  subject: string;
  html: string;
  text: string;
} {
  const adminUrl = `${getSiteUrl()}/admin/forms/incidents?ref=${encodeURIComponent(report.reference_number)}`;
  const notifiable = report.is_notifiable_under_whs ? "Yes" : "No";
  const corrective = report.immediate_corrective_action_required ? "Yes" : "No";

  const subject = `[Incident ${report.reference_number}] ${report.project_name ?? "Project"} — ${notifiable === "Yes" ? "NOTIFIABLE" : "New report"}`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">New Incident Report</h2>
      <p style="margin:0 0 16px">A worker has submitted an incident report that requires review.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        <tr><td style="padding:6px 0;font-weight:600">Reference</td><td>${report.reference_number}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Date / Time</td><td>${formatIncidentDateTime(report.incident_date_time)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Project</td><td>${report.project_name ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Submitted by</td><td>${report.submitted_by_name ?? "—"}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Injured worker</td><td>${report.injured_worker_name ?? "None recorded"}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Treatment</td><td>${report.treatment_details}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Notifiable (WHS)</td><td>${notifiable}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Immediate corrective action</td><td>${corrective}</td></tr>
        <tr><td style="padding:6px 0;font-weight:600">Status</td><td>${incidentStatusLabel(report.status)}</td></tr>
      </table>
      <p style="margin:16px 0 8px"><strong>What occurred</strong></p>
      <p style="margin:0 0 16px;white-space:pre-wrap">${report.what_occurred || "—"}</p>
      <p style="margin:0 0 24px">
        <a href="${adminUrl}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
          View in Admin Portal
        </a>
      </p>
    </div>
  `;

  const text = [
    `New Incident Report ${report.reference_number}`,
    `Date/Time: ${formatIncidentDateTime(report.incident_date_time)}`,
    `Project: ${report.project_name ?? "—"}`,
    `Submitted by: ${report.submitted_by_name ?? "—"}`,
    `Injured worker: ${report.injured_worker_name ?? "None recorded"}`,
    `Treatment: ${report.treatment_details}`,
    `Notifiable (WHS): ${notifiable}`,
    `Immediate corrective action: ${corrective}`,
    "",
    "What occurred:",
    report.what_occurred || "—",
    "",
    `Open: ${adminUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendIncidentNotificationEmails(
  admin: SupabaseClient,
  report: IncidentReportRecord
): Promise<{ sent: boolean; recipients: string[]; error?: string }> {
  const recipients = await resolveIncidentNotificationEmails(admin, report.project_id);
  if (recipients.length === 0) {
    return {
      sent: false,
      recipients: [],
      error: "No project manager or administrator emails found.",
    };
  }

  const { subject, html, text } = buildIncidentNotificationEmail(report);
  const result = await sendEmail({ to: recipients, subject, html, text });
  return {
    sent: result.sent,
    recipients,
    error: result.error,
  };
}
