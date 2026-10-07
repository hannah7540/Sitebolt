export const ACTIVE_ORG_COOKIE = "sitebolt_active_org_id";
export const ACTIVE_ORG_STORAGE_KEY = "sitebolt_active_org_id";

export const A_PLUS_ORGANISATION_ID = "00000000-0000-0000-0000-000000000001";
export const DEMO_ORGANISATION_ID = "00000000-0000-0000-0000-000000000002";

export const A_PLUS_ORGANISATION_NAME = "A Plus Plumbing (ACT) PTY LTD";
export const DEMO_ORGANISATION_NAME = "SiteBolt Demo Construction";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readBrowserCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (!part.startsWith(`${name}=`)) continue;
    const value = decodeURIComponent(part.slice(name.length + 1)).trim();
    return value || null;
  }
  return null;
}

export function getActiveOrganisationId(): string | null {
  if (typeof window === "undefined") return null;
  const fromCookie = readBrowserCookie(ACTIVE_ORG_COOKIE);
  if (fromCookie) return fromCookie;
  try {
    return localStorage.getItem(ACTIVE_ORG_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

const organisationCacheClearers: Array<() => void> = [];

export function onActiveOrganisationChange(clearCache: () => void): void {
  organisationCacheClearers.push(clearCache);
}

function notifyActiveOrganisationChanged(): void {
  for (const clearCache of organisationCacheClearers) {
    try {
      clearCache();
    } catch {
      // Cache clearers must not block workspace switching.
    }
  }
}

export function setActiveOrganisationId(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) return;

  if (typeof document !== "undefined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ACTIVE_ORG_COOKIE}=${encodeURIComponent(trimmed)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  }

  try {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, trimmed);
  } catch {
    // WebView storage can be unavailable; cookie still carries the workspace.
  }

  notifyActiveOrganisationChanged();
}

export function clearActiveOrganisationId(): void {
  if (typeof document !== "undefined") {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${ACTIVE_ORG_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
  }
  try {
    localStorage.removeItem(ACTIVE_ORG_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  notifyActiveOrganisationChanged();
}
