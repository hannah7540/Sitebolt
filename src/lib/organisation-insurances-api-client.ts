import {
  cleanInsuranceDate,
  type CompanyInsuranceRecord,
} from "@/lib/organisation-insurances-api";
import type { InsuranceDocumentAttachment } from "@/lib/insurance-utils";

export type CompanyInsuranceFormRecord = CompanyInsuranceRecord;

async function readJson<T>(
  response: Response
): Promise<{ data: T | null; error: string | null }> {
  const resData = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: T; error?: string }
    | null;

  if (!response.ok || resData?.success === false || resData?.error) {
    const message = resData?.error ?? `Request failed (${response.status})`;
    return { data: null, error: message };
  }

  return { data: resData?.data ?? null, error: null };
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
  documents?: InsuranceDocumentAttachment[];
  document_url?: string | null;
  notes?: string | null;
  all_states?: boolean;
  states?: string[];
}): Promise<{ insurance: CompanyInsuranceFormRecord | null; error: string | null }> {
  const policyId = typeof input.id === "string" ? input.id.trim() : "";
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const primary = documents[0];
  const payload = {
    ...input,
    start_date: cleanInsuranceDate(input.start_date ?? input.date_obtained),
    date_obtained: cleanInsuranceDate(input.date_obtained ?? input.start_date),
    expiry_date: cleanInsuranceDate(input.expiry_date),
    documents,
    file_url: primary?.url ?? input.file_url ?? input.document_url ?? null,
    file_name: primary?.name ?? input.file_name ?? null,
    document_url: primary?.url ?? input.file_url ?? input.document_url ?? null,
    states: Array.isArray(input.states) ? input.states : [],
  };

  const response = await fetch("/api/organisation/insurances", {
    method: policyId ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(policyId ? { ...payload, id: policyId } : payload),
  });

  const resData = (await response.json().catch(() => null)) as
    | { success?: boolean; data?: CompanyInsuranceFormRecord; error?: string }
    | null;

  if (!response.ok || resData?.success === false || resData?.error) {
    const message =
      resData?.error ?? `Server error saving insurance (${response.status})`;
    console.error("Insurance save failed:", {
      action: policyId ? "update" : "insert",
      policyId: policyId || null,
      status: response.status,
      error: message,
      response: resData,
    });
    return { insurance: null, error: message };
  }

  if (!resData?.data) {
    return { insurance: null, error: "Server returned no insurance data." };
  }

  return { insurance: resData.data, error: null };
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
    const message = resData?.error ?? `Request failed (${response.status})`;
    console.error("Insurance delete failed:", message, resData);
    return { error: message };
  }

  return { error: null };
}
