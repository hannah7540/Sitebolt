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
  swmsTitle: string;
  portalUrl: string;
}): { subject: string; html: string; text: string } {
  const title = input.swmsTitle.trim() || "SWMS";
  const subject = `Please review and sign: ${title}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
      <p style="font-size:16px;line-height:1.5;">
        You have been asked to review and sign a Safe Work Method Statement
        (<strong>${escapeHtml(title)}</strong>).
      </p>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(input.portalUrl)}"
           style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;">
          Open SWMS Portal
        </a>
      </p>
      <p style="font-size:14px;line-height:1.5;color:#475569;">
        On the portal, enter the email address this message was sent to, then
        open the SWMS, type your name, and sign.
      </p>
      <p style="font-size:13px;color:#64748b;">
        If the button does not work, copy this link:<br />
        <a href="${escapeHtml(input.portalUrl)}" style="color:#f97316;">${escapeHtml(input.portalUrl)}</a>
      </p>
    </div>
  `.trim();
  const text = [
    `You have been asked to review and sign a SWMS: ${title}`,
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
