export const DEFAULT_ORGANISATION_ID = "00000000-0000-0000-0000-000000000001";

export type OrganisationRow = Record<string, unknown> & {
  id?: string;
  name?: string | null;
  company_name?: string | null;
  trading_name?: string | null;
  abn?: string | null;
  acn?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  street_address?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  postal_code?: string | null;
  country?: string | null;
  logo_url?: string | null;
  logo?: string | null;
  company_logo?: string | null;
  settings?: Record<string, unknown> | null;
  updated_at?: string | null;
};

function trimOrNull(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function readSettingsLogo(record: OrganisationRow): string | null {
  const settings = record.settings;
  if (!settings || typeof settings !== "object") return null;
  return trimOrNull(settings.logo_url ?? settings.logo);
}

export function resolveOrganisationLogo(record: OrganisationRow): string | null {
  return (
    trimOrNull(record.logo_url) ??
    trimOrNull(record.logo) ??
    trimOrNull(record.company_logo) ??
    readSettingsLogo(record)
  );
}

export function resolveOrganisationSuburb(record: OrganisationRow): string {
  return trimOrNull(record.suburb) ?? trimOrNull(record.city) ?? "";
}

export function resolveOrganisationStreetAddress(record: OrganisationRow): string {
  return trimOrNull(record.street_address) ?? trimOrNull(record.address) ?? "";
}

export function resolveOrganisationPostcode(record: OrganisationRow): string {
  return trimOrNull(record.postcode) ?? trimOrNull(record.postal_code) ?? "";
}

export function enrichOrganisationRecord(record: OrganisationRow): OrganisationRow {
  const logo = resolveOrganisationLogo(record);
  const suburb = resolveOrganisationSuburb(record);
  const streetAddress = resolveOrganisationStreetAddress(record);
  const postcode = resolveOrganisationPostcode(record);

  return {
    ...record,
    logo_url: logo,
    logo,
    company_logo: logo,
    address: streetAddress,
    street_address: streetAddress,
    suburb,
    city: trimOrNull(record.city) ?? suburb,
    postcode,
    postal_code: trimOrNull(record.postal_code) ?? postcode,
  };
}

export function buildDefaultOrganisationRecord(): OrganisationRow {
  return {
    id: DEFAULT_ORGANISATION_ID,
    name: "SiteBolt",
    company_name: "SiteBolt Construction Pty Ltd",
    trading_name: "",
    abn: "",
    acn: "",
    phone: "",
    email: "",
    website: "",
    address: "",
    street_address: "",
    suburb: "",
    city: "",
    state: "",
    postcode: "",
    postal_code: "",
    country: "Australia",
    logo_url: null,
    logo: null,
    company_logo: null,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeOrganisationPayload(
  body: Record<string, unknown>
): Record<string, unknown> {
  const logo = trimOrNull(body.logo_url ?? body.logo ?? body.logoUrl);

  return {
    name: String(body.company_name ?? body.name ?? "SiteBolt"),
    company_name: String(body.company_name ?? body.name ?? "SiteBolt"),
    trading_name: String(body.trading_name ?? body.tradingName ?? ""),
    abn: String(body.abn ?? ""),
    acn: String(body.acn ?? ""),
    phone: String(body.phone ?? ""),
    email: String(body.email ?? ""),
    website: String(body.website ?? ""),
    address: String(body.address ?? body.street_address ?? ""),
    street_address: String(body.street_address ?? body.address ?? ""),
    suburb: String(body.suburb ?? body.city ?? ""),
    city: String(body.city ?? body.suburb ?? ""),
    state: String(body.state ?? ""),
    postcode: String(body.postcode ?? body.postal_code ?? ""),
    postal_code: String(body.postal_code ?? body.postcode ?? ""),
    country: String(body.country ?? "Australia"),
    logo_url: logo,
    logo,
    company_logo: logo,
    updated_at: new Date().toISOString(),
  };
}

export function mapOrganisationToForm(record: OrganisationRow) {
  const enriched = enrichOrganisationRecord(record);

  return {
    id: String(enriched.id ?? ""),
    company_name: String(enriched.company_name ?? enriched.name ?? "").trim(),
    trading_name: String(enriched.trading_name ?? "").trim(),
    abn: String(enriched.abn ?? "").trim(),
    acn: String(enriched.acn ?? "").trim(),
    phone: String(enriched.phone ?? "").trim(),
    email: String(enriched.email ?? "").trim(),
    website: String(enriched.website ?? "").trim(),
    address: resolveOrganisationStreetAddress(enriched),
    suburb: resolveOrganisationSuburb(enriched),
    state: String(enriched.state ?? "").trim(),
    postcode: resolveOrganisationPostcode(enriched),
    country: String(enriched.country ?? "Australia").trim(),
    logo_url: resolveOrganisationLogo(enriched),
  };
}
