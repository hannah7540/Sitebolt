/**
 * Public Supabase Storage URL for the SiteBolt email signature banner.
 * Absolute https URL required so Gmail/Outlook can load the image.
 */
export const SITEBOLT_EMAIL_BANNER_URL =
  "https://curuixppplfwwfmheflw.supabase.co/storage/v1/object/public/public-assets/SiteBold-Email-Banner.jpg";

/** Marker so the team footer is appended at most once. */
export const TEAM_EMAIL_FOOTER_MARKER = 'data-sitebolt-team-footer="true"';

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
<table ${TEAM_EMAIL_FOOTER_MARKER} role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
  <tr>
    <td>
      <p style="margin: 0 0 12px 0; font-size: 15px; font-weight: 600; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        The Site-Bolt Team
      </p>
      <img
        src="${SITEBOLT_EMAIL_BANNER_URL}"
        alt="SiteBolt Site Management Software"
        width="560"
        style="display: block; width: 100%; max-width: 560px; height: auto; border: 0; outline: none; text-decoration: none; border-radius: 8px;"
      />
    </td>
  </tr>
</table>`.trim();
}

export function buildTeamEmailFooterText(): string {
  return `\n\nThe Site-Bolt Team\n${SITEBOLT_EMAIL_BANNER_URL}\n`;
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
