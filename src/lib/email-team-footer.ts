/** Public asset path for the SiteBolt email banner (under /public). */
export const EMAIL_BANNER_PATH = "/images/sitebolt-email-banner.png";

/** Marker so the team footer is appended at most once. */
export const TEAM_EMAIL_FOOTER_MARKER = 'data-sitebolt-team-footer="true"';

const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";

function stripTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function isLocalHostUrl(value: string): boolean {
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.startsWith("http://0.0.0.0")
  );
}

/**
 * Absolute origin for email image URLs.
 * Prefers public production host so inboxes can fetch the asset.
 */
export function getEmailAssetBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL?.trim(),
    process.env.NEXT_PUBLIC_SITE_URL?.trim(),
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "",
    process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim()}`
      : "",
    PRODUCTION_SITE_URL,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = stripTrailingSlash(candidate);
    if (!normalized || isLocalHostUrl(normalized)) continue;
    return normalized;
  }

  return PRODUCTION_SITE_URL;
}

/**
 * Full absolute banner URL for email clients.
 * Optional EMAIL_BANNER_URL overrides app hosting (Supabase Storage / CDN / S3).
 */
export function getEmailBannerAbsoluteUrl(): string {
  const override = process.env.EMAIL_BANNER_URL?.trim();
  if (override && /^https?:\/\//i.test(override)) {
    return override;
  }

  return `${getEmailAssetBaseUrl()}${EMAIL_BANNER_PATH}`;
}

export function buildTeamEmailFooterHtml(): string {
  const bannerImageUrl = getEmailBannerAbsoluteUrl();
  return `
<div ${TEAM_EMAIL_FOOTER_MARKER} style="margin-top: 32px; padding-top: 8px; font-family: Arial, Helvetica, sans-serif;">
  <p style="margin-top: 24px; margin-bottom: 12px; font-size: 15px; color: #334155; font-weight: 500;">The Site-Bolt Team</p>
  <!--[if mso]>
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td>
  <![endif]-->
  <img
    src="${bannerImageUrl}"
    alt="SiteBolt Site Management Software"
    width="560"
    style="display: block; width: 100%; max-width: 560px; height: auto; margin: 12px 0; border: 0; outline: none; text-decoration: none;"
  />
  <!--[if mso]>
  </td></tr></table>
  <![endif]-->
</div>`.trim();
}

export function buildTeamEmailFooterText(): string {
  return `\n\nThe Site-Bolt Team\n${getEmailBannerAbsoluteUrl()}\n`;
}

export function hasTeamEmailFooter(html: string): boolean {
  return (
    html.includes(TEAM_EMAIL_FOOTER_MARKER) ||
    html.includes('alt="SiteBolt Site Management Software"')
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
