const PRODUCTION_APP_URL = "https://www.site-bolt.com.au";

/** Canonical on-machine QR path: /plant/{id}/pre-start */
export function getPlantPrestartPath(plantId: string): string {
  const id = sanitizePlantPrestartId(plantId);
  return id ? `/plant/${id}/pre-start` : "/prestart/";
}

export function sanitizePlantPrestartId(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[\s\r\n]+/g, "")
    .replace(/^["'`(<\[]+/, "")
    .replace(/["'`)>\].,]+$/g, "")
    .replace(/[)\].,]+$/g, "");
}

/** Unwrap markdown link leftovers from env/docs copy-paste. */
function unwrapMarkdownUrl(raw: string): string {
  const trimmed = raw.trim();
  const labeled = trimmed.match(/\]\((https?:\/\/[^)\s]+)\)/i);
  if (labeled?.[1]) return labeled[1];
  const bracketed = trimmed.match(/\[(https?:\/\/[^\]]+)\]/i);
  if (bracketed?.[1]) return bracketed[1];
  return trimmed;
}

/**
 * Force a public HTTPS origin for QR payloads.
 * iOS Camera / Safari reject http, localhost, markdown, and trailing junk.
 */
export function resolveHttpsQrOrigin(raw?: string | null): string {
  let value = unwrapMarkdownUrl(String(raw ?? ""))
    .trim()
    .replace(/[\s\r\n]+/g, "")
    .replace(/[)\].,]+$/g, "")
    .replace(/\/+$/g, "");

  if (!value) return PRODUCTION_APP_URL;

  if (value.startsWith("//")) {
    value = `https:${value}`;
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    value = `https://${value.replace(/^\/+/, "")}`;
  }

  value = value.replace(/^https?:\/\//i, "https://");

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return PRODUCTION_APP_URL;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
      return PRODUCTION_APP_URL;
    }
    return `https://${parsed.host}`.toLowerCase();
  } catch {
    return PRODUCTION_APP_URL;
  }
}

/** Strip markdown wrapping, trailing brackets/parentheses, and extra slashes. */
export function sanitizeQrUrlValue(value: string | null | undefined): string {
  return resolveHttpsQrOrigin(value);
}

export function resolvePlantPrestartOrigin(): string {
  return resolveHttpsQrOrigin(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || PRODUCTION_APP_URL
  );
}

/** Absolute plant pre-start URL encoded into QR stickers (raw https URL only). */
export function getPrestartUrl(plantId: string): string {
  const origin = resolvePlantPrestartOrigin().replace(/\/+$/, "");
  const id = sanitizePlantPrestartId(plantId);
  const cleanUrl = `${origin}/plant/${id}/pre-start`
    .trim()
    .replace(/[\s\r\n\)]+/g, "");

  if (cleanUrl.startsWith("https://") && id) {
    return cleanUrl;
  }

  return `${PRODUCTION_APP_URL}/plant/${id}/pre-start`;
}

export function isPlantPrestartPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0] || "";
  if (path === "/prestart" || path.startsWith("/prestart/")) return true;
  if (path === "/pre-start" || path.startsWith("/pre-start/")) return true;
  return /^\/plant\/[^/]+\/pre-start\/?$/.test(path);
}
