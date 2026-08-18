import {
  sanitizeInsuranceSavePayload,
  type CompanyInsuranceRecord,
} from "@/lib/organisation-insurances-api";

export type CompanyInsuranceFormRecord = CompanyInsuranceRecord;

function cleanClientDate(value: string | null | undefined): string | null {
  if (value && typeof value === "string" && value.trim() !== "") {
    return value.trim().slice(0, 10);
  }
  return null;
}

export function sanitizeInsuranceClientPayload(input: {
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
}) {
  const startDate =
    cleanClientDate(input.start_date) ?? cleanClientDate(input.date_obtained);
  const expiryDate = cleanClientDate(input.expiry_date);

  return sanitizeInsuranceSavePayload({
    id: input.id,
    insurance_type: input.insurance_type,
    custom_type_name: input.custom_type_name,
    policy_number: input.policy_number,
    provider: input.provider,
    start_date: startDate,
    date_obtained: startDate,
    expiry_date: expiryDate,
    file_url: input.file_url ?? input.document_url,
    file_name: input.file_name,
    notes: input.notes,
    all_states: input.all_states,
    states: Array.isArray(input.states) ? input.states : [],
  });
}

async function readSaveResponse(
  response: Response
): Promise<{ data: CompanyInsuranceFormRecord | null; error: string | null }> {
  const resData = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: CompanyInsuranceFormRecord; error?: string }
    | null;

  if (!response.ok || resData?.success === false || resData?.error) {
    const message =
      resData?.error ?? `Server error saving insurance (${response.status})`;
    console.error("Insurance save failed:", message, resData);
    return { data: null, error: message };
  }

  if (!resData?.data) {
    return { data: null, error: "Server returned no insurance data." };
  }

  return { data: resData.data, error: null };
}

export async function fetchCompanyInsurancesFromApi(): Promise<{
  insurances: CompanyInsuranceFormRecord[];
  error: string | null;
}> {
  const response = await fetch("/api/organisation/insurances", {
    method: "GET",
    cache: "no-store",
  });
  const resData = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: CompanyInsuranceFormRecord[]; error?: string }
    | null;

  if (!response.ok || resData?.success === false || resData?.error) {
    return {
      insurances: [],
      error: resData?.error ?? `Request failed (${response.status})`,
    };
  }

  return { insurances: resData?.data ?? [], error: null };
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
  const payload = sanitizeInsuranceClientPayload(input);

  const response = await fetch("/api/organisation/insurances", {
    method: input.id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, id: input.id }),
  });

  const result = await readSaveResponse(response);
  return { insurance: result.data, error: result.error };
}

export async function deleteCompanyInsuranceFromApi(
  id: string
): Promise<{ error: string | null }> {
  const response = await fetch("/api/organisation/insurances", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const resData = (await response.json().catch(() => null)) as
    | { success?: boolean; error?: string }
    | null;

  if (!response.ok || resData?.success === false || resData?.error) {
    return { error: resData?.error ?? `Request failed (${response.status})` };
  }

  return { error: null };
}
