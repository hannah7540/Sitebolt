import {
  formatItcAutoName,
  formatItcSequence,
  itcAutoNamePrefix,
  jobNumberFromProjectName,
  parseItcAutoNameSequence,
  sanitizeItcCodePart,
  sanitizeItcServiceCode,
} from "@/lib/itc-naming";

/** ITC numbers: `{Job/Project}-{Service}-ITC{001}` e.g. `2401-HV-ITC001`. */

export const ADMIN_ITC_SEQUENCE_DIGITS = 3;

export function sanitizeAdminItcPart(value: string | null | undefined, fallback: string): string {
  return sanitizeItcCodePart(value, fallback);
}

export function sanitizeServiceCode(value: string | null | undefined): string {
  return sanitizeItcServiceCode(value);
}

export function formatAdminItcSequence(sequence: number): string {
  return formatItcSequence(sequence);
}

export function adminItcNumberPrefix(projectNumber: string, service: string): string {
  return itcAutoNamePrefix(jobNumberFromProjectName(projectNumber), service);
}

export function formatAdminItcNumber(
  projectNumber: string,
  service: string,
  sequence: number
): string {
  return formatItcAutoName(jobNumberFromProjectName(projectNumber), service, sequence);
}

export function parseAdminItcSequence(itcNumber: string | null | undefined): number | null {
  return parseItcAutoNameSequence(String(itcNumber ?? ""));
}

export function drawingNameFromUploadFile(fileName: string): string {
  return String(fileName ?? "")
    .trim()
    .replace(/\.[^.]+$/i, "")
    .trim();
}

export function adminItcPinMarker(
  itcNumber: string | null | undefined,
  fallbackIndex: number
): string {
  const sequence = parseAdminItcSequence(itcNumber);
  return String(sequence ?? fallbackIndex);
}

export function maxAdminItcSequence(numbers: Array<string | null | undefined>): number {
  return numbers.reduce((current, value) => {
    const sequence = parseAdminItcSequence(value);
    return sequence != null ? Math.max(current, sequence) : current;
  }, 0);
}

export type ServiceRunPoint = { x: number; y: number };

export function parseServiceRunCoordinates(raw: unknown): ServiceRunPoint[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const x = Number((item as { x?: unknown }).x);
      const y = Number((item as { y?: unknown }).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
    })
    .filter((point): point is ServiceRunPoint => point != null);
}

export function parseLinesCount(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function blockNonIntegerKey(event: { key: string; preventDefault: () => void }): void {
  if (["e", "E", "+", "-", ".", ","].includes(event.key)) {
    event.preventDefault();
  }
}
