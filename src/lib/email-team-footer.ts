import { SITEBOLT_SUPPORT_EMAIL } from "./email-config";

/**
 * Public Supabase Storage URL for the SiteBolt email signature banner.
 * Absolute https URL required so Gmail/Outlook can load the image.
 */
export const SITEBOLT_EMAIL_BANNER_URL =
  "https://curuixppplfwwfmheflw.supabase.co/storage/v1/object/public/public-assets/SiteBold-Email-Banner.jpg";

/** Marker so the team footer is appended at most once. */
export const TEAM_EMAIL_FOOTER_MARKER = 'data-sitebolt-team-footer="true"';

const FOOTER_FONT =
  "Arial, Helvetica, sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto";

const CONFIDENTIALITY_DISCLAIMER =
  "This email and any attachments are confidential and intended solely for the named recipient. If you received this email in error, please notify us at " +
  SITEBOLT_SUPPORT_EMAIL +
  " and delete it. Unauthorised use or disclosure is prohibited.";

/** Always the public Supabase Storage banner URL. */
export function getEmailBannerAbsoluteUrl(): string {
  return SITEBOLT_EMAIL_BANNER_URL;
}

/**
 * Outlook/Gmail-compatible signature footer with hosted banner image.
 * Applied automatically via sendEmail() and direct Resend invite/reset paths.
 */
export function buildTeamEmailFooterHtml(): string {
  return `
<table ${TEAM_EMAIL_FOOTER_MARKER} role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; border-collapse: collapse;">
  <tr>
    <td style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-family: ${FOOTER_FONT};">
      <p style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #0F172A; font-family: ${FOOTER_FONT};">
        The Site-Bolt Team
      </p>
      <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #475569; font-family: ${FOOTER_FONT};">
        SiteBolt &mdash; construction safety &amp; compliance management.<br />
        Need help?
        <a href="mailto:${SITEBOLT_SUPPORT_EMAIL}" style="color: #0F172A; font-weight: 600; text-decoration: underline;">${SITEBOLT_SUPPORT_EMAIL}</a>
      </p>
      <img
        src="${SITEBOLT_EMAIL_BANNER_URL}"
        alt="SiteBolt Site Management Software"
        width="560"
        style="display: block; width: 100%; max-width: 560px; height: auto; border: 0; outline: none; text-decoration: none; border-radius: 8px;"
      />
      <p style="margin: 16px 0 0 0; font-size: 11px; line-height: 1.5; color: #94a3b8; font-family: ${FOOTER_FONT};">
        ${CONFIDENTIALITY_DISCLAIMER}
      </p>
    </td>
  </tr>
</table>`.trim();
}

export function buildTeamEmailFooterText(): string {
  return `\n\nThe Site-Bolt Team\nSiteBolt — construction safety & compliance management.\nNeed help? ${SITEBOLT_SUPPORT_EMAIL}\n${SITEBOLT_EMAIL_BANNER_URL}\n\n${CONFIDENTIALITY_DISCLAIMER}\n`;
}

export function hasTeamEmailFooter(html: string): boolean {
  return (
    html.includes(TEAM_EMAIL_FOOTER_MARKER) ||
    html.includes('alt="SiteBolt Site Management Software"') ||
    html.includes("SiteBold-Email-Banner.jpg")
  );
}

/** Append the standard SiteBolt team signature + banner (idempotent). */
export function appendTeamEmailFooter(html: string): string {
  const body = html?.trim() ?? "";
  if (!body || hasTeamEmailFooter(body)) return html;
  return `${body}\n${buildTeamEmailFooterHtml()}`;
}

export function appendTeamEmailFooterText(text?: string | null): string {
  const trimmed = (text ?? "").trimEnd();
  if (!trimmed) return buildTeamEmailFooterText().trim();
  if (trimmed.includes("The Site-Bolt Team")) return trimmed;
  return `${trimmed}${buildTeamEmailFooterText()}`;
}
