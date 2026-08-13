/** ITC auto-name: `[Site Number] - [Service Type] - [Number]` e.g. `MP5 - Electrical - 0023` */

export function formatItcAutoName(
  siteNumber: string,
  serviceType: string,
  sequence: number
): string {
  const site = siteNumber.trim().toUpperCase() || "SITE";
  const service =
    serviceType.trim().charAt(0).toUpperCase() + serviceType.trim().slice(1) || "General";
  return `${site} - ${service} - ${String(sequence).padStart(4, "0")}`;
}

export function parseItcAutoNameSequence(itcNumber: string): number | null {
  const match = itcNumber.trim().match(/-\s*(\d+)\s*$/);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

/** Match site + service prefix for sequence counting. */
export function itcAutoNamePrefix(siteNumber: string, serviceType: string): string {
  const site = siteNumber.trim().toUpperCase() || "SITE";
  const service =
    serviceType.trim().charAt(0).toUpperCase() + serviceType.trim().slice(1) || "General";
  return `${site} - ${service} -`;
}

export const ITC_FIELD_PHOTO_STEP_KEY = "field";
export const ITC_MAX_FIELD_PHOTOS = 9;
export const ITC_MAX_FINAL_PHOTOS = 9;
