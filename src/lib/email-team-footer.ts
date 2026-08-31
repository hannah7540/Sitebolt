import { getSiteUrl } from "@/lib/supabase/env";

/** Public asset path for the SiteBolt email banner (under /public). */
export const EMAIL_BANNER_PATH = "/images/email-banner.png";

/** Marker so the team footer is appended at most once. */
export const TEAM_EMAIL_FOOTER_MARKER = 'data-sitebolt-team-footer="true"';

const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";

/**
 * Absolute origin for email image URLs.
 * Prefer configured public site URL; fall back to production so local/dev
 * emails still load the banner in real inboxes.
 */
export function getEmailAssetBaseUrl(): string {
  const configured = getSiteUrl().replace(/\/$/, "");
  if (
    !configured ||
    configured.includes("localhost") ||
    configured.includes("127.0.0.1")
  ) {
    return PRODUCTION_SITE_URL;
  }
  return configured;
}

export function getEmailBannerAbsoluteUrl(): string {
  return `${getEmailAssetBaseUrl()}${EMAIL_BANNER_PATH}`;
}

export function buildTeamEmailFooterHtml(): string {
  const bannerUrl = getEmailBannerAbsoluteUrl();
  return `
<div ${TEAM_EMAIL_FOOTER_MARKER} style="margin-top: 32px; padding-top: 8px; font-family: Arial, Helvetica, sans-serif;">
  <p style="margin-top: 24px; margin-bottom: 12px; font-size: 15px; color: #334155; font-weight: 500;">The Site-Bolt Team</p>
  <img
    src="${bannerUrl}"
    alt="SiteBolt Site Management Software"
    width="600"
    style="display: block; width: 100%; max-width: 600px; height: auto; border: 0; outline: none; text-decoration: none; border-radius: 8px; margin-top: 8px;"
  />
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
