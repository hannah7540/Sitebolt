/** ITC numbers: `{Job/Project}-{Service}-ITC{001}` e.g. `2401-HV-ITC001`. */

export const ITC_SEQUENCE_DIGITS = 3;

export function sanitizeItcCodePart(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || fallback;
}

export function sanitizeItcServiceCode(value: string | null | undefined): string {
  return sanitizeItcCodePart(value, "SVC").toUpperCase();
}

export function jobNumberFromProjectName(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  const leading = raw.match(/^(\d{3,8})\b/);
  if (leading?.[1]) return leading[1];
  return sanitizeItcCodePart(raw, "JOB");
}

export function formatItcSequence(sequence: number): string {
  const safe = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return String(safe).padStart(ITC_SEQUENCE_DIGITS, "0");
}

export function formatItcAutoName(
  siteNumber: string,
  serviceType: string,
  sequence: number
): string {
  return `${sanitizeItcCodePart(siteNumber, "JOB")}-${sanitizeItcServiceCode(serviceType)}-ITC${formatItcSequence(sequence)}`;
}

export function parseItcAutoNameSequence(itcNumber: string): number | null {
  const raw = String(itcNumber ?? "").trim();
  const modern = raw.match(/ITC(\d+)\s*$/i);
  const legacySlash = raw.match(/\/(\d+)\s*$/);
  const legacyDash = raw.match(/-\s*(\d+)\s*$/);
  const match = modern ?? legacySlash ?? legacyDash;
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function itcAutoNamePrefix(siteNumber: string, serviceType: string): string {
  return `${sanitizeItcCodePart(siteNumber, "JOB")}-${sanitizeItcServiceCode(serviceType)}-ITC`;
}

export const ITC_FIELD_PHOTO_STEP_KEY = "field";
export const ITC_MAX_FIELD_PHOTOS = 9;
export const ITC_MAX_FINAL_PHOTOS = 9;
