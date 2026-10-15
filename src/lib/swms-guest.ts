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
  const origin = siteUrl.replace(/\/+$/, "");
  return `${origin}${GUEST_SWMS_PATH}`;
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
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <p style="font-size:16px;line-height:1.5;">
        ${intro}
      </p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(input.portalUrl)}"
           style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">
          Open SWMS Portal
        </a>
      </p>
      <p style="font-size:14px;line-height:1.5;color:#475569;">
        On the portal, enter the email address this message was sent to, then
        open each SWMS, type your name, and sign.
      </p>
      <p style="font-size:13px;color:#64748b;">
        If the button does not work, copy this link:<br />
        <a href="${escapeHtml(input.portalUrl)}" style="color:#f97316;">${escapeHtml(input.portalUrl)}</a>
      </p>
    </div>
  `.trim();
  const text = [
    count === 1
      ? `You have been asked to review and sign a SWMS: ${firstTitle}`
      : `You have been asked to review and sign ${count} SWMS documents:\n${titles
          .map((title) => `- ${title}`)
          .join("\n")}`,
    "",
    `Open the guest portal: ${input.portalUrl}`,
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
