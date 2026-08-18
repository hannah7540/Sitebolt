import { mapOrganisationToForm } from "@/lib/organisation-api";

export interface OrganisationFormRecord {
  id: string;
  company_name: string;
  trading_name: string;
  abn: string;
  acn: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  logo_url: string | null;
}

async function readJson<T>(response: Response): Promise<{ data: T | null; error: string | null }> {
  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string }
    | null;

  if (!response.ok) {
    return {
      data: null,
      error: payload?.error ?? `Request failed (${response.status})`,
    };
  }

  return { data: payload?.data ?? null, error: null };
}

export async function fetchOrganisationFromApi(): Promise<{
  organisation: OrganisationFormRecord | null;
  error: string | null;
}> {
  const response = await fetch("/api/organisation", {
    method: "GET",
    cache: "no-store",
  });
  const result = await readJson<Record<string, unknown>>(response);
  if (result.error || !result.data) {
    return { organisation: null, error: result.error ?? "Failed to load organisation." };
  }

  return {
    organisation: mapOrganisationToForm(result.data) as OrganisationFormRecord,
    error: null,
  };
}

export async function saveOrganisationToApi(input: {
  company_name: string;
  trading_name?: string;
  abn?: string;
  acn?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  street_address?: string;
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  postal_code?: string;
  country?: string;
  logo_url?: string | null;
  logo?: string | null;
}): Promise<{ organisation: OrganisationFormRecord | null; error: string | null }> {
  const response = await fetch("/api/organisation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await readJson<Record<string, unknown>>(response);
  if (result.error || !result.data) {
    return {
      organisation: null,
      error: result.error ?? "Failed to save organisation details",
    };
  }

  return {
    organisation: mapOrganisationToForm(result.data) as OrganisationFormRecord,
    error: null,
  };
}
