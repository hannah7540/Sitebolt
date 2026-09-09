const PRODUCTION_APP_URL = "https://www.site-bolt.com.au";

/** Canonical on-machine QR path: /plant/{id}/pre-start */
export function getPlantPrestartPath(plantId: string): string {
  const id = sanitizePlantPrestartId(plantId);
  return id ? `/plant/${id}/pre-start` : "/prestart/";
}

export function sanitizePlantPrestartId(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^["'`(<\[]+/, "")
    .replace(/["'`)>\].,]+$/g, "");
}

/** Strip markdown wrapping, trailing brackets/parentheses, and extra slashes from a QR URL piece. */
export function sanitizeQrUrlValue(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/^["'`(<\[]+/, "")
    .replace(/["'`)>\].,]+$/g, "")
    .replace(/\/+$/, "");
}

export function resolvePlantPrestartOrigin(): string {
  const configured = sanitizeQrUrlValue(
    process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""
  );
  if (configured) return configured;

  if (typeof window !== "undefined") {
    const origin = sanitizeQrUrlValue(window.location.origin);
    if (origin) return origin;
  }

  return PRODUCTION_APP_URL;
}

/** Absolute plant pre-start URL encoded into QR stickers. */
export function getPrestartUrl(plantId: string): string {
  const origin = resolvePlantPrestartOrigin();
  const path = getPlantPrestartPath(plantId);
  return `${origin}${path}`.replace(/\)$/, "");
}

export function isPlantPrestartPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0] || "";
  if (path === "/prestart" || path.startsWith("/prestart/")) return true;
  if (path === "/pre-start" || path.startsWith("/pre-start/")) return true;
  return /^\/plant\/[^/]+\/pre-start\/?$/.test(path);
}
