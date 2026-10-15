import { PRODUCTION_APP_ORIGIN } from "@/lib/site-domains";
import { appendTeamEmailFooter } from "@/lib/email-team-footer";

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
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeGuestEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidGuestEmail(value: string): boolean {
  return EMAIL_RE.test(normalizeGuestEmail(value));
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

  const innerHtml = `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <tr>
        <td style="padding:8px 0;font-size:16px;line-height:1.5;">
          ${intro}
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:24px 0;">
          <table border="0" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td align="center" bgcolor="#2563eb" style="border-radius:6px;background-color:#2563eb;">
                <a href="${href}" target="_blank" rel="noopener noreferrer"
                   style="display:inline-block;padding:12px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;font-family:Arial,Helvetica,sans-serif;line-height:1.2;">
                  Open SWMS Portal
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 0 16px 0;font-size:14px;line-height:1.5;color:#475569;">
          On the portal, enter the email address this message was sent to, then
          open each SWMS, type your name, and sign.
        </td>
      </tr>
      <tr>
        <td style="font-size:13px;line-height:1.5;color:#64748b;">
          If the button does not work, copy this link:<br />
          <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${href}</a>
        </td>
      </tr>
    </table>
  `.trim();

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f8fafc;color:#0f172a;">
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
