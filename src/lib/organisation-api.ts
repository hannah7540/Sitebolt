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
  company_logo?: string | null;
  updated_at?: string | null;
};

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
    company_logo: null,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeOrganisationPayload(
  body: Record<string, unknown>
): OrganisationRow {
  const companyName = String(body.company_name ?? body.name ?? "SiteBolt").trim();
  const address = String(body.address ?? body.street_address ?? "").trim();
  const suburb = String(body.suburb ?? body.city ?? "").trim();
  const postcode = String(body.postcode ?? body.postal_code ?? "").trim();

  return {
    name: companyName || "SiteBolt",
    company_name: companyName || "SiteBolt",
    trading_name: String(body.trading_name ?? body.tradingName ?? "").trim(),
    abn: String(body.abn ?? "").trim(),
    acn: String(body.acn ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    email: String(body.email ?? "").trim(),
    website: String(body.website ?? "").trim(),
    address,
    street_address: String(body.street_address ?? body.address ?? "").trim() || address,
    suburb,
    city: String(body.city ?? body.suburb ?? "").trim() || suburb,
    state: String(body.state ?? "").trim(),
    postcode,
    postal_code: String(body.postal_code ?? body.postcode ?? "").trim() || postcode,
    country: String(body.country ?? "Australia").trim() || "Australia",
    logo_url: (body.logo_url ?? body.logoUrl ?? null) as string | null,
    company_logo: (body.logo_url ?? body.logoUrl ?? null) as string | null,
    updated_at: new Date().toISOString(),
  };
}

export function mapOrganisationToForm(record: OrganisationRow) {
  return {
    id: String(record.id ?? ""),
    company_name: String(record.company_name ?? record.name ?? "").trim(),
    trading_name: String(record.trading_name ?? "").trim(),
    abn: String(record.abn ?? "").trim(),
    acn: String(record.acn ?? "").trim(),
    phone: String(record.phone ?? "").trim(),
    email: String(record.email ?? "").trim(),
    website: String(record.website ?? "").trim(),
    address: String(record.address ?? record.street_address ?? "").trim(),
    suburb: String(record.suburb ?? record.city ?? "").trim(),
    state: String(record.state ?? "").trim(),
    postcode: String(record.postcode ?? record.postal_code ?? "").trim(),
    country: String(record.country ?? "Australia").trim(),
    logo_url: String(record.logo_url ?? record.company_logo ?? "").trim() || null,
  };
}
