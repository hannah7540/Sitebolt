import { A_PLUS_ORGANISATION_ID } from "@/lib/active-organisation";

export function nameIncludesAPlus(value: string | null | undefined): boolean {
  return /a\s*plus/i.test(String(value ?? "").trim());
}

/**
 * Silica is optional for A Plus Plumbing workers. Subcontractor workers still
 * require it unless the subcontractor company name itself includes "A Plus".
 */
export function isSilicaOptionalForWorker(input: {
  organisationId?: string | null;
  organisationName?: string | null;
  subcontractorId?: string | null;
  subcontractorName?: string | null;
  isSubcontractor?: boolean | null;
}): boolean {
  const subcontractorId = String(input.subcontractorId ?? "").trim();
  const isSubcontractor =
    input.isSubcontractor === true || Boolean(subcontractorId);

  if (isSubcontractor) {
    return nameIncludesAPlus(input.subcontractorName);
  }

  if (String(input.organisationId ?? "").trim() === A_PLUS_ORGANISATION_ID) {
    return true;
  }

  return (
    nameIncludesAPlus(input.organisationName) ||
    nameIncludesAPlus(input.subcontractorName)
  );
}
