/** ITC numbers: `{Project}/{Area}/{00001}` e.g. `Marsden Park/MP2/00001`. */

export const ADMIN_ITC_SEQUENCE_DIGITS = 5;

export function sanitizeAdminItcPart(value: string | null | undefined, fallback: string): string {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ");
  return cleaned || fallback;
}

export function formatAdminItcSequence(sequence: number): string {
  const safe = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return String(safe).padStart(ADMIN_ITC_SEQUENCE_DIGITS, "0");
}

export function adminItcNumberPrefix(projectName: string, area: string): string {
  return `${sanitizeAdminItcPart(projectName, "Project")}/${sanitizeAdminItcPart(area, "AREA")}/`;
}

export function formatAdminItcNumber(
  projectName: string,
  area: string,
  sequence: number
): string {
  return `${adminItcNumberPrefix(projectName, area)}${formatAdminItcSequence(sequence)}`;
}

export function parseAdminItcSequence(itcNumber: string | null | undefined): number | null {
  const match = String(itcNumber ?? "")
    .trim()
    .match(/\/(\d+)\s*$/);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : null;
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
