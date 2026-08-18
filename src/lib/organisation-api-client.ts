import { type OrganisationRecord } from "@/lib/organisation-api";

export type OrganisationFormRecord = OrganisationRecord;

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
  const result = await readJson<OrganisationFormRecord>(response);
  if (result.error || !result.data) {
    return { organisation: null, error: result.error ?? "Failed to load organisation." };
  }

  return { organisation: result.data, error: null };
}

export async function saveOrganisationToApi(input: {
  company_name: string;
  abn?: string;
  email?: string;
  phone?: string;
  logo_url?: string | null;
}): Promise<{ organisation: OrganisationFormRecord | null; error: string | null }> {
  const response = await fetch("/api/organisation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await readJson<OrganisationFormRecord>(response);
  if (result.error || !result.data) {
    return {
      organisation: null,
      error: result.error ?? "Failed to save organisation details",
    };
  }

  return { organisation: result.data, error: null };
}

export async function fetchOrganisationBrandingFromApi(): Promise<{
  company_name: string;
  logo_url: string | null;
  error: string | null;
}> {
  const { organisation, error } = await fetchOrganisationFromApi();
  if (error || !organisation) {
    return { company_name: "SiteBolt", logo_url: null, error };
  }
  return {
    company_name: organisation.company_name || "SiteBolt",
    logo_url: organisation.logo_url,
    error: null,
  };
}
