import { supabase, isSupabaseConfigured } from "./supabase";
import { normalizeWorkerUuidArray } from "./project-resolver";
export type { SubcontractorPlant } from "./subcontractor-plant-service";
export {
  fetchSubcontractorPlant,
  insertSubcontractorPlant,
  insertSubcontractorPlantFromForm,
} from "./subcontractor-plant-service";

export interface Subcontractor {
  id: string;
  company_name: string;
  abn: string;
  contact_name: string;
  contact_person: string;
  contact_email: string;
  email: string;
  contact_phone: string;
  phone: string;
  address: string;
  trade_type: string;
  trade_category: string;
  trade: string;
  status: "active" | "inactive" | "suspended" | "Active" | "Archived";
  is_archived: boolean;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

/** Safe baseline when merging partial subcontractor records in the UI. */
export const EMPTY_SUBCONTRACTOR: Subcontractor = {
  id: "",
  company_name: "",
  abn: "",
  contact_name: "",
  contact_person: "",
  contact_email: "",
  email: "",
  contact_phone: "",
  phone: "",
  address: "",
  trade_type: "",
  trade_category: "",
  trade: "",
  status: "active",
  is_archived: false,
  notes: "",
};

export function getSubcontractorContactName(
  subbie: Pick<Subcontractor, "contact_name" | "contact_person"> | {
    contact_name?: string | null;
    contact_person?: string | null;
  }
): string {
  return (subbie.contact_name || subbie.contact_person || "").trim() || "N/A";
}

export function getSubcontractorPhone(
  subbie: Pick<Subcontractor, "contact_phone" | "phone"> | {
    contact_phone?: string | null;
    phone?: string | null;
  }
): string {
  return (subbie.contact_phone || subbie.phone || "").trim() || "N/A";
}

export function getSubcontractorEmail(
  subbie: Pick<Subcontractor, "contact_email" | "email"> | {
    contact_email?: string | null;
    email?: string | null;
  }
): string {
  return (subbie.contact_email || subbie.email || "").trim();
}

export const DEFAULT_SUBCONTRACTOR_TRADE_LABEL = "General Subcontractor";

function resolveSubcontractorTradeValue(
  subbie: {
    trade_type?: string | null;
    trade_category?: string | null;
    trade?: string | null;
  }
): string {
  return (
    normalizeSubcontractorText(subbie.trade_type).trim() ||
    normalizeSubcontractorText(subbie.trade_category).trim() ||
    normalizeSubcontractorText(subbie.trade).trim()
  );
}

export function getSubcontractorTrade(
  subbie: Pick<Subcontractor, "trade_type" | "trade_category" | "trade"> | {
    trade_type?: string | null;
    trade_category?: string | null;
    trade?: string | null;
  }
): string {
  return resolveSubcontractorTradeValue(subbie) || DEFAULT_SUBCONTRACTOR_TRADE_LABEL;
}

export function isSubcontractorArchived(
  subbie: Pick<Subcontractor, "is_archived" | "status">
): boolean {
  return Boolean(
    subbie.is_archived === true ||
      String(subbie.is_archived) === "true" ||
      subbie.status === "Archived"
  );
}

export function getSubcontractorStatusLabel(subbie: Subcontractor): string {
  if (isSubcontractorArchived(subbie)) return "Archived";
  if (subbie.status === "Active" || subbie.status === "active") return "Active";
  if (subbie.status === "inactive") return "Inactive";
  if (subbie.status === "suspended") return "Suspended";
  return "Active";
}

/** Merge partial API/UI data onto safe defaults for rendering. */
export function coerceSubcontractor(
  subbie?: Partial<Subcontractor> | null
): Subcontractor {
  if (!subbie) return { ...EMPTY_SUBCONTRACTOR };
  return {
    ...EMPTY_SUBCONTRACTOR,
    ...subbie,
    company_name: normalizeSubcontractorText(subbie.company_name),
    abn: normalizeSubcontractorText(subbie.abn),
    contact_name: normalizeSubcontractorText(subbie.contact_name),
    contact_person: normalizeSubcontractorText(subbie.contact_person),
    contact_email: normalizeSubcontractorText(subbie.contact_email),
    email: normalizeSubcontractorText(subbie.email),
    contact_phone: normalizeSubcontractorText(subbie.contact_phone),
    phone: normalizeSubcontractorText(subbie.phone),
    address: normalizeSubcontractorText(subbie.address),
    trade_type: resolveSubcontractorTradeValue(subbie),
    trade_category: resolveSubcontractorTradeValue(subbie),
    trade: resolveSubcontractorTradeValue(subbie),
    notes: normalizeSubcontractorText(subbie.notes),
    is_archived: isSubcontractorArchived({
      is_archived: subbie.is_archived ?? false,
      status: subbie.status ?? "active",
    }),
    status:
      subbie.status === "inactive" || subbie.status === "suspended"
        ? subbie.status
        : isSubcontractorArchived({
            is_archived: subbie.is_archived ?? false,
            status: subbie.status ?? "active",
          })
          ? "Archived"
          : subbie.status === "Active"
            ? "Active"
            : "active",
  };
}

export interface SubcontractorDocument {
  id: string;
  subcontractor_id: string;
  document_type: string;
  title: string | null;
  expiry_date: string | null;
  document_url: string | null;
  created_at?: string;
}

export interface SubcontractorWorker {
  id: string;
  subcontractor_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  white_card_number: string | null;
  white_card_expiry: string | null;
  licence_expiry: string | null;
  assigned_project_ids: string[];
  status: string;
  created_at?: string;
}

function normalizeSubcontractorText(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/** Trim optional text for DB writes; empty input becomes null. */
function optionalDbText(value: unknown): string | null {
  const text = normalizeSubcontractorText(value).trim();
  return text || null;
}

function normalizeSubcontractorTrade(row: Record<string, unknown>): string {
  return resolveSubcontractorTradeValue({
    trade_type: row.trade_type as string | null | undefined,
    trade_category: row.trade_category as string | null | undefined,
    trade: row.trade as string | null | undefined,
  });
}

function normalizeSubcontractorEmail(row: Record<string, unknown>): string {
  const contactEmail = normalizeSubcontractorText(row.contact_email).trim();
  const email = normalizeSubcontractorText(row.email).trim();
  return contactEmail || email || "";
}

function normalizeSubcontractorContactName(row: Record<string, unknown>): string {
  const contactName = normalizeSubcontractorText(row.contact_name).trim();
  const contactPerson = normalizeSubcontractorText(row.contact_person).trim();
  return contactName || contactPerson || "";
}

function normalizeSubcontractorPhone(row: Record<string, unknown>): string {
  const contactPhone = normalizeSubcontractorText(row.contact_phone).trim();
  const phone = normalizeSubcontractorText(row.phone).trim();
  return contactPhone || phone || "";
}

function normalizeSubcontractor(row: Record<string, unknown>): Subcontractor {
  const email = normalizeSubcontractorEmail(row);
  const contactName = normalizeSubcontractorContactName(row);
  const phone = normalizeSubcontractorPhone(row);
  const trade = normalizeSubcontractorTrade(row);
  const status = row.status;
  const isArchived = Boolean(
    row.is_archived === true ||
      String(row.is_archived) === "true" ||
      status === "Archived"
  );
  return coerceSubcontractor({
    id: String(row.id ?? ""),
    company_name: String(row.company_name ?? ""),
    abn: normalizeSubcontractorText(row.abn),
    contact_name: contactName,
    contact_person: contactName,
    contact_email: email,
    email,
    contact_phone: phone,
    phone,
    address: normalizeSubcontractorText(row.address),
    trade_type: trade,
    trade_category: trade,
    trade,
    notes: normalizeSubcontractorText(row.notes),
    is_archived: isArchived,
    status:
      status === "inactive" || status === "suspended"
        ? status
        : isArchived
          ? "Archived"
          : status === "Active"
            ? "Active"
            : "active",
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  });
}

type SubcontractorWriteInput = {
  companyName: string;
  abn?: string;
  contactName?: string;
  contactPerson?: string;
  contactEmail?: string;
  email?: string;
  contactPhone?: string;
  phone?: string;
  address?: string;
  tradeType?: string;
  tradeCategory?: string;
  trade?: string;
  notes?: string;
};

function buildSubcontractorOptionalFields(input: SubcontractorWriteInput) {
  const emailValue = optionalDbText(input.contactEmail ?? input.email);
  const contactNameValue = optionalDbText(input.contactName ?? input.contactPerson);
  const phoneValue = optionalDbText(input.contactPhone ?? input.phone);
  const tradeValue = optionalDbText(
    input.tradeType ?? input.tradeCategory ?? input.trade
  );

  return {
    abn: optionalDbText(input.abn),
    contact_name: contactNameValue,
    contact_person: contactNameValue,
    contact_email: emailValue,
    email: emailValue,
    contact_phone: phoneValue,
    phone: phoneValue,
    address: optionalDbText(input.address),
    trade_type: tradeValue,
    trade_category: tradeValue,
    trade: tradeValue,
    notes: optionalDbText(input.notes),
  };
}

function normalizeSubcontractorWorker(row: Record<string, unknown>): SubcontractorWorker {
  return {
    id: String(row.id ?? ""),
    subcontractor_id: String(row.subcontractor_id ?? ""),
    full_name: normalizeSubcontractorText(row.full_name),
    phone: normalizeSubcontractorText(row.phone) || null,
    email: normalizeSubcontractorText(row.email) || null,
    white_card_number: normalizeSubcontractorText(row.white_card_number) || null,
    white_card_expiry: normalizeSubcontractorText(row.white_card_expiry) || null,
    licence_expiry: normalizeSubcontractorText(row.licence_expiry) || null,
    assigned_project_ids: normalizeWorkerUuidArray(
      row.assigned_project_ids as string[] | null
    ),
    status: normalizeSubcontractorText(row.status) || "active",
    created_at: row.created_at as string | undefined,
  };
}

function resolveSubcontractorDocumentUrl(row: Record<string, unknown>): string {
  const fileUrl = normalizeSubcontractorText(row.file_url).trim();
  const docUrl = normalizeSubcontractorText(row.doc_url).trim();
  const documentUrl = normalizeSubcontractorText(row.document_url).trim();
  return fileUrl || docUrl || documentUrl || "";
}

export function getSubcontractorDocumentUrl(
  doc: Pick<SubcontractorDocument, "document_url"> & {
    file_url?: string | null;
    doc_url?: string | null;
  }
): string {
  return (
    normalizeSubcontractorText(doc.file_url).trim() ||
    normalizeSubcontractorText(doc.doc_url).trim() ||
    normalizeSubcontractorText(doc.document_url).trim() ||
    ""
  );
}

function normalizeSubcontractorDocumentRow(
  row: Record<string, unknown>
): SubcontractorDocument {
  const documentUrl = resolveSubcontractorDocumentUrl(row);
  return {
    id: String(row.id ?? ""),
    subcontractor_id: String(row.subcontractor_id ?? ""),
    document_type: normalizeSubcontractorText(row.document_type),
    title: normalizeSubcontractorText(row.title) || null,
    expiry_date: normalizeSubcontractorText(row.expiry_date) || null,
    document_url: documentUrl || null,
    created_at: row.created_at as string | undefined,
  };
}

export async function fetchSubcontractors(): Promise<Subcontractor[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from("subcontractors")
    .select("*")
    .order("company_name", { ascending: true });
  if (error) {
    console.error("fetchSubcontractors failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) => normalizeSubcontractor(row as Record<string, unknown>));
}

export async function fetchSubcontractorById(id: string): Promise<Subcontractor | null> {
  if (!id.trim() || !isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from("subcontractors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeSubcontractor(data as Record<string, unknown>);
}

export async function insertSubcontractor(input: {
  companyName: string;
  abn?: string;
  contactName?: string;
  contactPerson?: string;
  contactEmail?: string;
  email?: string;
  contactPhone?: string;
  phone?: string;
  address?: string;
  tradeType?: string;
  tradeCategory?: string;
  trade?: string;
  notes?: string;
}): Promise<{ error: string | null; id: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", id: null };
  }
  const optionalFields = buildSubcontractorOptionalFields(input);
  const { data, error } = await supabase
    .from("subcontractors")
    .insert([
      {
        company_name: normalizeSubcontractorText(input.companyName).trim(),
        ...optionalFields,
        status: "active",
      },
    ])
    .select("id")
    .single();
  if (error) return { error: error.message, id: null };
  return { error: null, id: data?.id ?? null };
}

export async function updateSubcontractor(input: {
  id: string;
  companyName?: string;
  abn?: string;
  contactName?: string;
  contactPerson?: string;
  contactEmail?: string;
  email?: string;
  contactPhone?: string;
  phone?: string;
  address?: string;
  tradeType?: string;
  tradeCategory?: string;
  trade?: string;
  notes?: string;
  status?: Subcontractor["status"];
}): Promise<{ error: string | null }> {
  if (!input.id.trim() || !isSupabaseConfigured()) {
    return { error: "Subcontractor id is required." };
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.companyName !== undefined) {
    payload.company_name = normalizeSubcontractorText(input.companyName).trim();
  }
  if (input.abn !== undefined) payload.abn = optionalDbText(input.abn);
  if (input.contactName !== undefined || input.contactPerson !== undefined) {
    const contactNameValue = optionalDbText(input.contactName ?? input.contactPerson);
    payload.contact_name = contactNameValue;
    payload.contact_person = contactNameValue;
  }
  if (input.contactPhone !== undefined || input.phone !== undefined) {
    const phoneValue = optionalDbText(input.contactPhone ?? input.phone);
    payload.contact_phone = phoneValue;
    payload.phone = phoneValue;
  }
  if (input.address !== undefined) payload.address = optionalDbText(input.address);
  if (input.tradeType !== undefined || input.tradeCategory !== undefined || input.trade !== undefined) {
    const tradeValue = optionalDbText(input.tradeType ?? input.tradeCategory ?? input.trade);
    payload.trade_type = tradeValue;
    payload.trade_category = tradeValue;
    payload.trade = tradeValue;
  }
  if (input.notes !== undefined) payload.notes = optionalDbText(input.notes);
  if (input.status !== undefined) payload.status = input.status;

  if (input.contactEmail !== undefined || input.email !== undefined) {
    const emailValue = optionalDbText(input.contactEmail ?? input.email);
    payload.contact_email = emailValue;
    payload.email = emailValue;
  }

  const { error } = await supabase
    .from("subcontractors")
    .update(payload)
    .eq("id", input.id);

  return { error: error?.message ?? null };
}

export async function setSubcontractorArchiveState(
  id: string,
  archived: boolean
): Promise<{ error: string | null }> {
  if (!id.trim() || !isSupabaseConfigured()) {
    return { error: "Subcontractor id is required." };
  }

  const { error } = await supabase
    .from("subcontractors")
    .update({
      is_archived: archived,
      status: archived ? "Archived" : "Active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return { error: error?.message ?? null };
}

export async function fetchSubcontractorDocuments(
  subcontractorId: string
): Promise<SubcontractorDocument[]> {
  try {
    if (!subcontractorId.trim() || !isSupabaseConfigured()) return [];

    const { data, error } = await supabase
      .from("subcontractor_documents")
      .select("*")
      .eq("subcontractor_id", subcontractorId)
      .order("expiry_date", { ascending: true, nullsFirst: false });

    if (error) {
      console.error("fetchSubcontractorDocuments failed:", error.message);
      return [];
    }

    if (!data) return [];

    return data.map((row) =>
      normalizeSubcontractorDocumentRow(row as Record<string, unknown>)
    );
  } catch (error) {
    console.error(
      "fetchSubcontractorDocuments failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function insertSubcontractorDocument(input: {
  subcontractorId: string;
  documentType: string;
  title?: string;
  expiryDate?: string | null;
  documentUrl?: string | null;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const { error } = await supabase.from("subcontractor_documents").insert([
    {
      subcontractor_id: input.subcontractorId,
      document_type: normalizeSubcontractorText(input.documentType).trim(),
      title: optionalDbText(input.title),
      expiry_date: optionalDbText(input.expiryDate),
      document_url: optionalDbText(input.documentUrl),
    },
  ]);
  return { error: error?.message ?? null };
}

export async function fetchSubcontractorWorkers(
  subcontractorId: string
): Promise<SubcontractorWorker[]> {
  if (!subcontractorId.trim() || !isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from("subcontractor_workers")
    .select("*")
    .eq("subcontractor_id", subcontractorId)
    .order("full_name", { ascending: true });
  if (error) {
    console.error("fetchSubcontractorWorkers failed:", error.message);
    return [];
  }
  return (data ?? []).map((row) =>
    normalizeSubcontractorWorker(row as Record<string, unknown>)
  );
}

export async function insertSubcontractorWorker(input: {
  subcontractorId: string;
  fullName: string;
  phone?: string;
  email?: string;
  whiteCardNumber?: string;
  whiteCardExpiry?: string | null;
  licenceExpiry?: string | null;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const { error } = await supabase.from("subcontractor_workers").insert([
    {
      subcontractor_id: input.subcontractorId,
      full_name: normalizeSubcontractorText(input.fullName).trim(),
      phone: optionalDbText(input.phone),
      email: optionalDbText(input.email),
      white_card_number: optionalDbText(input.whiteCardNumber),
      white_card_expiry: optionalDbText(input.whiteCardExpiry),
      licence_expiry: optionalDbText(input.licenceExpiry),
      assigned_project_ids: [],
      status: "active",
    },
  ]);
  return { error: error?.message ?? null };
}

export async function assignSubcontractorWorkersToProject(
  workerIds: string[],
  projectId: string
): Promise<{ error: string | null }> {
  if (!projectId.trim() || workerIds.length === 0) {
    return { error: "Select at least one worker and a project." };
  }
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };

  for (const workerId of workerIds) {
    const { data, error: fetchError } = await supabase
      .from("subcontractor_workers")
      .select("assigned_project_ids")
      .eq("id", workerId)
      .maybeSingle();

    if (fetchError) return { error: fetchError.message };
    if (!data) return { error: "Subcontractor worker not found." };

    const current = normalizeWorkerUuidArray(
      data.assigned_project_ids as string[] | null
    );
    const next = normalizeWorkerUuidArray([...current, projectId]);

    const { error: updateError } = await supabase
      .from("subcontractor_workers")
      .update({ assigned_project_ids: next, updated_at: new Date().toISOString() })
      .eq("id", workerId);

    if (updateError) return { error: updateError.message };
  }

  return { error: null };
}
