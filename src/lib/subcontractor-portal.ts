import { parseMissingColumnFromError } from "./form-payload-utils";
import {
  mapSubcontractorPortalPlantRow,
  mapSubcontractorPortalWorkerRow,
  type SubcontractorPortalPlant,
  type SubcontractorPortalWorker,
} from "./subcontractor-portal-models";
import { createSupabaseServerClient } from "./supabase/server";
import { getTicketStatus, type TicketStatus } from "./worker-utils";

export const SUBCONTRACTOR_PORTAL_PATH = "/subcontractor";

export interface SubcontractorPortalRecord {
  id: string;
  organisation_id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  abn: string;
  address: string;
  public_liability_expiry: string;
  public_liability_value: string;
  public_liability_document_url: string;
  professional_indemnity_expiry: string;
  professional_indemnity_value: string;
  professional_indemnity_document_url: string;
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const next = text(value);
    if (next) return next;
  }
  return "";
}

function isPublicLiabilityType(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  return (
    normalized === "public_liability" ||
    normalized === "pl" ||
    normalized.includes("public_liability")
  );
}

function isProfessionalIndemnityType(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  return (
    normalized === "professional_indemnity" ||
    normalized === "pi" ||
    normalized.includes("professional_indemnity")
  );
}

function mapSubcontractorRow(row: Record<string, unknown>): SubcontractorPortalRecord {
  return {
    id: text(row.id),
    organisation_id: text(row.organisation_id),
    company_name: text(row.company_name) || "Your company",
    contact_name: firstText(row.contact_name, row.contact_person),
    contact_email: firstText(row.contact_email, row.email),
    abn: text(row.abn),
    address: text(row.address),
    public_liability_expiry: firstText(
      row.public_liability_expiry,
      row.pl_expiry
    ),
    public_liability_value: firstText(
      row.public_liability_value,
      row.public_liability_policy_value,
      row.pl_policy_value
    ),
    public_liability_document_url: firstText(
      row.public_liability_document_url,
      row.pl_document_url
    ),
    professional_indemnity_expiry: firstText(
      row.professional_indemnity_expiry,
      row.pi_expiry
    ),
    professional_indemnity_value: firstText(
      row.professional_indemnity_value,
      row.professional_indemnity_policy_value,
      row.pi_policy_value
    ),
    professional_indemnity_document_url: firstText(
      row.professional_indemnity_document_url,
      row.pi_document_url
    ),
  };
}

function applyDocument(
  record: SubcontractorPortalRecord,
  document: Record<string, unknown>
): SubcontractorPortalRecord {
  const type = text(document.document_type);
  const expiry = text(document.expiry_date);
  const url = text(document.document_url);
  const title = text(document.title);
  const valueFromTitle = title.includes("—")
    ? title.split("—").slice(1).join("—").trim()
    : "";

  if (isPublicLiabilityType(type)) {
    return {
      ...record,
      public_liability_expiry: record.public_liability_expiry || expiry,
      public_liability_value: record.public_liability_value || valueFromTitle,
      public_liability_document_url: record.public_liability_document_url || url,
    };
  }

  if (isProfessionalIndemnityType(type)) {
    return {
      ...record,
      professional_indemnity_expiry: record.professional_indemnity_expiry || expiry,
      professional_indemnity_value: record.professional_indemnity_value || valueFromTitle,
      professional_indemnity_document_url:
        record.professional_indemnity_document_url || url,
    };
  }

  return record;
}

async function querySubcontractorBy(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  column: string,
  value: string
): Promise<{ row: Record<string, unknown> | null; missingColumn: boolean }> {
  const { data, error } = await supabase
    .from("subcontractors")
    .select("*")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    const missing = parseMissingColumnFromError(error.message);
    return { row: null, missingColumn: missing === column };
  }

  return {
    row: (data as Record<string, unknown> | null) ?? null,
    missingColumn: false,
  };
}

export function insuranceTone(expiry: string): {
  status: TicketStatus;
  cardClass: string;
  badgeClass: string;
  label: string;
} {
  const status = getTicketStatus(expiry || null);
  if (status === "expired") {
    return {
      status,
      cardClass: "border-red-200 bg-red-50",
      badgeClass: "bg-red-100 text-red-800",
      label: "Expired",
    };
  }
  if (status === "expires_soon") {
    return {
      status,
      cardClass: "border-amber-200 bg-amber-50",
      badgeClass: "bg-amber-100 text-amber-800",
      label: "Expiring soon",
    };
  }
  if (status === "valid") {
    return {
      status,
      cardClass: "border-emerald-200 bg-emerald-50",
      badgeClass: "bg-emerald-100 text-emerald-800",
      label: "Current",
    };
  }
  return {
    status,
    cardClass: "border-slate-200 bg-white",
    badgeClass: "bg-slate-100 text-slate-600",
    label: "No expiry set",
  };
}

export async function loadCurrentSubcontractorPortal(): Promise<{
  userId: string | null;
  email: string | null;
  record: SubcontractorPortalRecord | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { userId: null, email: null, record: null };
  }

  const email = user.email?.trim().toLowerCase() ?? "";
  const lookups: Array<{ column: string; value: string }> = [
    { column: "user_id", value: user.id },
    { column: "auth_user_id", value: user.id },
  ];
  if (email) {
    lookups.push({ column: "email", value: email });
    lookups.push({ column: "contact_email", value: email });
  }

  let row: Record<string, unknown> | null = null;
  for (const lookup of lookups) {
    const result = await querySubcontractorBy(supabase, lookup.column, lookup.value);
    if (result.row) {
      row = result.row;
      break;
    }
  }

  if (!row) {
    return { userId: user.id, email: email || null, record: null };
  }

  let record = mapSubcontractorRow(row);

  if (record.id) {
    const { data: documents } = await supabase
      .from("subcontractor_documents")
      .select("document_type, title, expiry_date, document_url")
      .eq("subcontractor_id", record.id);

    for (const document of documents ?? []) {
      record = applyDocument(record, document as Record<string, unknown>);
    }
  }

  return { userId: user.id, email: email || null, record };
}

const PLANT_TABLES = ["plant", "plant_equipment", "subcontractor_plant"] as const;

export async function fetchSubcontractorPortalWorkers(
  subcontractorId: string
): Promise<SubcontractorPortalWorker[]> {
  const id = subcontractorId.trim();
  if (!id) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workers")
    .select(
      "id, first_name, last_name, full_name, worker_name, email, phone, trade, worker_type, white_card_doc_url, white_card_photo_url, silica_cert_doc_url, silica_cert_photo_url, voc_details, voc_title, voc_document_url, status"
    )
    .eq("subcontractor_id", id)
    .order("full_name", { ascending: true, nullsFirst: false });

  if (error) {
    const fallback = await supabase
      .from("workers")
      .select("id, first_name, last_name, full_name, worker_name, email, phone, trade")
      .eq("subcontractor_id", id);
    if (fallback.error || !fallback.data) return [];
    return fallback.data.map((row) =>
      mapSubcontractorPortalWorkerRow(row as Record<string, unknown>)
    );
  }

  return (data ?? []).map((row) =>
    mapSubcontractorPortalWorkerRow(row as Record<string, unknown>)
  );
}

export async function fetchSubcontractorPortalPlant(
  subcontractorId: string
): Promise<SubcontractorPortalPlant[]> {
  const id = subcontractorId.trim();
  if (!id) return [];
  const supabase = await createSupabaseServerClient();

  for (const table of PLANT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("subcontractor_id", id);

    if (error) continue;
    if (data && data.length > 0) {
      return data.map((row) =>
        mapSubcontractorPortalPlantRow(row as Record<string, unknown>)
      );
    }
    if (data) {
      return [];
    }
  }

  return [];
}
