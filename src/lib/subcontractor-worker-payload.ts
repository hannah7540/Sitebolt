import {
  nullIfBlank,
  nullIfBlankDate,
  sanitizeWritePayload,
} from "./form-payload-utils";
import { buildWorkerFullName } from "./worker-utils";

export interface SubcontractorVocDetail {
  title: string;
  issuing_org: string | null;
  document_url: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
}

export function optionalWorkerText(
  value: string | null | undefined
): string | null {
  return nullIfBlank(value);
}

export function optionalWorkerDate(
  value: string | null | undefined
): string | null {
  return nullIfBlankDate(value);
}

export function serializeVocDetails(
  vocs: SubcontractorVocDetail[]
): string | null {
  const items = vocs
    .filter((voc) => voc.title?.trim())
    .map((voc) => ({
      title: voc.title.trim(),
      issuing_org: optionalWorkerText(voc.issuing_org),
      document_url: optionalWorkerText(voc.document_url),
      issue_date: optionalWorkerDate(voc.issue_date ?? null),
      expiry_date: optionalWorkerDate(voc.expiry_date ?? null),
    }));

  if (items.length === 0) return null;
  return JSON.stringify(items);
}

export function parseVocDetails(
  raw: string | null | undefined
): SubcontractorVocDetail[] {
  if (!raw?.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const items: SubcontractorVocDetail[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const title = String(record.title ?? "").trim();
      if (!title) continue;

      items.push({
        title,
        issuing_org: optionalWorkerText(
          typeof record.issuing_org === "string" ? record.issuing_org : null
        ),
        document_url: optionalWorkerText(
          typeof record.document_url === "string"
            ? record.document_url
            : null
        ),
        issue_date: optionalWorkerDate(
          typeof record.issue_date === "string" ? record.issue_date : null
        ),
        expiry_date: optionalWorkerDate(
          typeof record.expiry_date === "string" ? record.expiry_date : null
        ),
      });
    }
    return items;
  } catch {
    return [];
  }
}

export function getVocExpiriesFromDetails(
  raw: string | null | undefined
): (string | null)[] {
  return parseVocDetails(raw).map((voc) => voc.expiry_date ?? null);
}

export interface SubcontractorWorkerFormInput {
  subcontractorId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dob?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  whiteCardNumber?: string;
  whiteCardIssueDate?: string;
  whiteCardDocUrl?: string | null;
  silicaCertNumber?: string;
  silicaCertIssueDate?: string;
  silicaCertDocUrl?: string | null;
  vocDetails?: SubcontractorVocDetail[];
}

/** Safe workers-table payload for subcontractor onboarding inserts. */
export function buildSubcontractorWorkerPayload(
  input: SubcontractorWorkerFormInput
): Record<string, unknown> {
  return sanitizeWritePayload(buildSubcontractorWorkerPayloadRaw(input), {
    requiredTextKeys: ["first_name", "last_name", "email"],
  });
}

function buildSubcontractorWorkerPayloadRaw(
  input: SubcontractorWorkerFormInput
): Record<string, unknown> {
  const first_name = input.firstName.trim();
  const last_name = input.lastName.trim();
  const whiteCardDocUrl = input.whiteCardDocUrl ?? null;
  const silicaCertDocUrl = input.silicaCertDocUrl ?? null;
  const voc_details = serializeVocDetails(input.vocDetails ?? []);

  return {
    first_name,
    last_name,
    full_name: buildWorkerFullName(first_name, last_name),
    worker_name: buildWorkerFullName(first_name, last_name),
    email: input.email.trim(),
    phone: optionalWorkerText(input.phone),
    dob: optionalWorkerDate(input.dob),
    emergency_contact_name: optionalWorkerText(input.emergencyContactName),
    emergency_contact_phone: optionalWorkerText(input.emergencyContactPhone),
    emergency_contact_relationship: optionalWorkerText(
      input.emergencyContactRelationship
    ),
    white_card_number: optionalWorkerText(input.whiteCardNumber),
    white_card_issue_date: optionalWorkerDate(input.whiteCardIssueDate),
    white_card_doc_url: whiteCardDocUrl,
    white_card_photo_url: whiteCardDocUrl,
    silica_cert_number: optionalWorkerText(input.silicaCertNumber),
    silica_cert_issue_date: optionalWorkerDate(input.silicaCertIssueDate),
    silica_cert_doc_url: silicaCertDocUrl,
    silica_cert_photo_url: silicaCertDocUrl,
    voc_details,
    status: "pending_induction",
    is_subcontractor: true,
    subcontractor_id: input.subcontractorId.trim(),
  };
}

export function getWorkerWhiteCardDocUrl(worker: {
  white_card_doc_url?: string | null;
  white_card_photo_url?: string | null;
}): string | null {
  return worker.white_card_doc_url ?? worker.white_card_photo_url ?? null;
}

export function getWorkerSilicaCertDocUrl(worker: {
  silica_cert_doc_url?: string | null;
  silica_cert_photo_url?: string | null;
}): string | null {
  return worker.silica_cert_doc_url ?? worker.silica_cert_photo_url ?? null;
}
