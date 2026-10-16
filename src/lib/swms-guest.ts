import { PRODUCTION_APP_ORIGIN } from "@/lib/site-domains";
import { appendTeamEmailFooter } from "@/lib/email-team-footer";
import type { SwmsAssignmentRecord } from "@/lib/supabase";

export const SWMS_GUEST_ASSIGNMENTS_TABLE = "swms_guest_assignments";
export const GUEST_SWMS_PATH = "/guest/swms";

export type SwmsGuestAssignmentStatus = "pending" | "signed";

export interface SwmsGuestAssignmentRow {
  id: string;
  swms_id: string;
  guest_email: string;
  guest_name: string | null;
  signature_data: string | null;
  status: SwmsGuestAssignmentStatus;
  signed_at: string | null;
  assigned_by: string | null;
  created_at: string | null;
}

export interface GuestPendingSwmsItem {
  id: string;
  swms_id: string;
  guest_email: string;
  created_at: string | null;
  swmsTitle: string;
  swmsDocumentUrl: string;
  version: string | null;
  isExternal?: boolean;
  externalCompanyName?: string | null;
  storagePath?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeGuestEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidGuestEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeGuestEmail(value));
}

export function formatGuestAssigneeLabel(
  email: string,
  name?: string | null
): string {
  const who = name?.trim() || email.trim() || "Guest";
  return /\(guest\)/i.test(who) ? who : `${who} (Guest)`;
}

export function isGuestSwmsAssignment(
  assignment: { assignee_type?: string | null } | null | undefined
): boolean {
  return assignment?.assignee_type === "guest";
}

export function parseSwmsGuestAssignmentRow(
  row: Record<string, unknown>
): SwmsGuestAssignmentRow {
  const status =
    String(row.status ?? "pending").toLowerCase() === "signed"
      ? "signed"
      : "pending";
  return {
    id: String(row.id ?? ""),
    swms_id: String(row.swms_id ?? ""),
    guest_email: String(row.guest_email ?? ""),
    guest_name: row.guest_name ? String(row.guest_name) : null,
    signature_data: row.signature_data ? String(row.signature_data) : null,
    status,
    signed_at: row.signed_at ? String(row.signed_at) : null,
    assigned_by: row.assigned_by ? String(row.assigned_by) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

export function mapGuestRowToSwmsAssignment(
  row: SwmsGuestAssignmentRow
): SwmsAssignmentRecord {
  return {
    id: row.id,
    swms_id: row.swms_id,
    assignee_type: "guest",
    assignee_id: row.guest_email,
    worker_id: null,
    assignee_name: formatGuestAssigneeLabel(row.guest_email, row.guest_name),
    signing_token: "",
    status: row.status === "signed" ? "Signed" : "Pending",
    signature_url: row.signature_data,
    signed_at: row.signed_at,
    created_at: row.created_at ?? undefined,
  };
}

export function buildGuestSwmsPortalUrl(siteUrl: string): string {
  let origin = (siteUrl || "").trim().replace(/\/+$/, "");
  if (!origin) origin = PRODUCTION_APP_ORIGIN;
  if (!/^https?:\/\//i.test(origin)) {
    origin = `https://${origin.replace(/^\/+/, "")}`;
  }
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${PRODUCTION_APP_ORIGIN}${GUEST_SWMS_PATH}`;
    }
    return `${parsed.origin}${GUEST_SWMS_PATH}`;
  } catch {
    return `${PRODUCTION_APP_ORIGIN}${GUEST_SWMS_PATH}`;
  }
}

export function buildGuestSwmsInviteEmail(input: {
  swmsTitles: string[];
  portalUrl: string;
}): { subject: string; html: string; text: string } {
  const titles = input.swmsTitles
    .map((title) => title.trim())
    .filter(Boolean);
  const count = titles.length || 1;
  const firstTitle = titles[0] || "SWMS";
  const portalUrl = buildGuestSwmsPortalUrl(input.portalUrl);
  const href = escapeHtml(portalUrl);
  const subject =
    count === 1
      ? `Please review and sign: ${firstTitle}`
      : `Please review and sign ${count} SWMS documents`;
  const listHtml =
    count === 1
      ? `<strong>${escapeHtml(firstTitle)}</strong>`
      : `<ul style="padding-left:18px;margin:8px 0;">${titles
          .map((title) => `<li>${escapeHtml(title)}</li>`)
          .join("")}</ul>`;
  const intro =
    count === 1
      ? `You have been asked to review and sign a Safe Work Method Statement (${listHtml}).`
      : `You have been asked to review and sign ${count} Safe Work Method Statements:${listHtml}`;

  const orangeButtonHtml = `<a href="${href}" style="display: inline-block; padding: 14px 28px; background-color: #F48120; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold; font-family: sans-serif; text-align: center;">Open SWMS Portal</a>`;

  const innerHtml = `<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
<p style="font-size: 16px; line-height: 1.5;">${intro}</p>
<p style="margin: 24px 0;">${orangeButtonHtml}</p>
<p style="font-size: 14px; line-height: 1.5; color: #475569;">On the portal, enter the email address this message was sent to, then open each SWMS, type your name, and sign.</p>
</div>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#ffffff;">
    ${appendTeamEmailFooter(innerHtml)}
  </body>
</html>`;

  const text = [
    count === 1
      ? `You have been asked to review and sign a SWMS: ${firstTitle}`
      : `You have been asked to review and sign ${count} SWMS documents:\n${titles
          .map((title) => `- ${title}`)
          .join("\n")}`,
    "",
    `Open SWMS Portal: ${portalUrl}`,
    "Enter this email address to see your pending documents.",
  ].join("\n");
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
