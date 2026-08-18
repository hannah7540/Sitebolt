import {
  type CompanyInsuranceRecord,
} from "@/lib/organisation-insurances-api";

export type CompanyInsuranceFormRecord = CompanyInsuranceRecord;

async function readJson<T>(
  response: Response
): Promise<{ data: T | null; error: string | null }> {
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

export async function fetchCompanyInsurancesFromApi(): Promise<{
  insurances: CompanyInsuranceFormRecord[];
  error: string | null;
}> {
  const response = await fetch("/api/organisation/insurances", {
    method: "GET",
    cache: "no-store",
  });
  const result = await readJson<CompanyInsuranceFormRecord[]>(response);
  if (result.error || !result.data) {
    return {
      insurances: [],
      error: result.error ?? "Failed to load insurances.",
    };
  }

  return { insurances: result.data, error: null };
}

export async function saveCompanyInsuranceToApi(input: {
  id?: string;
  insurance_type: string;
  custom_type_name?: string | null;
  policy_number?: string | null;
  provider?: string | null;
  date_obtained?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  document_url?: string | null;
  notes?: string | null;
  all_states?: boolean;
  states?: string[];
}): Promise<{ insurance: CompanyInsuranceFormRecord | null; error: string | null }> {
  const response = await fetch("/api/organisation/insurances", {
    method: input.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await readJson<CompanyInsuranceFormRecord>(response);
  if (result.error || !result.data) {
    return {
      insurance: null,
      error: result.error ?? "Failed to save insurance policy.",
    };
  }

  return { insurance: result.data, error: null };
}

export async function deleteCompanyInsuranceFromApi(
  id: string
): Promise<{ error: string | null }> {
  const response = await fetch("/api/organisation/insurances", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const result = await readJson<{ id: string }>(response);
  return { error: result.error };
}
