import {
  resolvePlantPrestartOrigin,
  sanitizePlantPrestartId,
} from "@/lib/plant-prestart-url";

const PRODUCTION_APP_URL = "https://www.site-bolt.com.au";

/** Canonical fleet QR path: /pre-start?type=fleet&id=[fleet_id] */
export function getFleetPrestartPath(fleetId: string): string {
  const id = sanitizePlantPrestartId(fleetId);
  return id ? `/pre-start?type=fleet&id=${encodeURIComponent(id)}` : "/pre-start?type=fleet";
}

/** Absolute fleet pre-start URL encoded into QR stickers (raw https URL only). */
export function getFleetPrestartUrl(fleetId: string): string {
  const origin = resolvePlantPrestartOrigin().replace(/\/+$/, "");
  const id = sanitizePlantPrestartId(fleetId);
  const cleanUrl = `${origin}/pre-start?type=fleet&id=${encodeURIComponent(id)}`
    .trim()
    .replace(/[\s\r\n\)]+/g, "");

  if (cleanUrl.startsWith("https://") && id) {
    return cleanUrl;
  }

  return `${PRODUCTION_APP_URL}/pre-start?type=fleet&id=${encodeURIComponent(id)}`;
}

export function isFleetPrestartSearchParams(
  type: string | null | undefined,
  id: string | null | undefined
): boolean {
  return String(type ?? "").trim().toLowerCase() === "fleet" && Boolean(sanitizePlantPrestartId(id));
}
