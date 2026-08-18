export const DEFAULT_ORGANISATION_ID = "00000000-0000-0000-0000-000000000001";

export const ORGANISATION_SELECT_FIELDS =
  "id, company_name, abn, email, phone, logo_url, logo, company_logo";

export type OrganisationRow = Record<string, unknown> & {
  id?: string;
  company_name?: string | null;
  name?: string | null;
  abn?: string | null;
  email?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  logo?: string | null;
  company_logo?: string | null;
  updated_at?: string | null;
};

export interface OrganisationRecord {
  id: string;
  company_name: string;
  abn: string;
  email: string;
  phone: string;
  logo_url: string | null;
}

function trimOrNull(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function resolveOrganisationLogo(record: OrganisationRow): string | null {
  return (
    trimOrNull(record.logo_url) ??
    trimOrNull(record.logo) ??
    trimOrNull(record.company_logo)
  );
}

export function buildDefaultOrganisationRecord(): OrganisationRow {
  return {
    id: DEFAULT_ORGANISATION_ID,
    company_name: "SiteBolt Construction Pty Ltd",
    abn: "",
    email: "",
    phone: "",
    logo_url: null,
    updated_at: new Date().toISOString(),
  };
}

export function mapOrganisationResponse(record: OrganisationRow): OrganisationRecord {
  return {
    id: String(record.id ?? ""),
    company_name: String(record.company_name ?? record.name ?? "SiteBolt").trim(),
    abn: String(record.abn ?? "").trim(),
    email: String(record.email ?? "").trim(),
    phone: String(record.phone ?? "").trim(),
    logo_url: resolveOrganisationLogo(record),
  };
}

export function normalizeOrganisationSavePayload(
  body: Record<string, unknown>
): Record<string, string | null> {
  return {
    company_name: String(body.company_name ?? "SiteBolt").trim(),
    abn: String(body.abn ?? "").trim(),
    email: String(body.email ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    logo_url: trimOrNull(body.logo_url ?? body.logo),
    updated_at: new Date().toISOString(),
  };
}

/** @deprecated Use mapOrganisationResponse */
export function mapOrganisationToForm(record: OrganisationRow): OrganisationRecord {
  return mapOrganisationResponse(record);
}
