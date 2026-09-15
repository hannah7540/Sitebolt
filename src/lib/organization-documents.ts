import { supabase, isSupabaseConfigured } from "./supabase";
import {
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
} from "./supabase-errors";

const DOCUMENTS_TABLE = "organization_documents";

const MISSING_TABLE_MESSAGE =
  "Documents table is missing. Run migration 162_organization_documents.sql in Supabase.";

export interface OrganizationDocument {
  id: string;
  name: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

function formatDocumentsError(error: { message?: string; code?: string }): string {
  const normalized = toSupabaseRequestError({
    message: error.message ?? "",
    code: error.code ?? "",
    details: "",
    hint: "",
  });
  if (
    isSupabaseRelationMissingError(normalized) ||
    isSupabaseTableUnavailableError(normalized) ||
    isSupabaseSchemaCacheError(normalized)
  ) {
    return MISSING_TABLE_MESSAGE;
  }
  return error.message || "Failed to save organisation document.";
}

function normalizeDocumentRow(row: Record<string, unknown>): OrganizationDocument {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    file_url: String(row.file_url ?? ""),
    file_name: row.file_name ? String(row.file_name) : null,
    file_size:
      row.file_size == null || row.file_size === ""
        ? null
        : Number(row.file_size),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export async function fetchOrganizationDocuments(): Promise<{
  data: OrganizationDocument[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .select("id, name, file_url, file_name, file_size, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: [], error: formatDocumentsError(error) };
  }

  return {
    data: (data ?? []).map((row) => normalizeDocumentRow(row as Record<string, unknown>)),
    error: null,
  };
}

export async function insertOrganizationDocument(input: {
  id: string;
  name: string;
  file_url: string;
  file_name?: string | null;
  file_size?: number | null;
}): Promise<{ data: OrganizationDocument | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .insert({
      id: input.id,
      name: input.name.trim(),
      file_url: input.file_url,
      file_name: input.file_name?.trim() || null,
      file_size: input.file_size ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("id, name, file_url, file_name, file_size, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return { data: null, error: formatDocumentsError(error) };
  }

  return {
    data: data ? normalizeDocumentRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function updateOrganizationDocument(
  id: string,
  input: {
    name: string;
    file_url?: string;
    file_name?: string | null;
    file_size?: number | null;
  }
): Promise<{ data: OrganizationDocument | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    updated_at: new Date().toISOString(),
  };
  if (input.file_url !== undefined) payload.file_url = input.file_url;
  if (input.file_name !== undefined) payload.file_name = input.file_name?.trim() || null;
  if (input.file_size !== undefined) payload.file_size = input.file_size;

  const { data, error } = await supabase
    .from(DOCUMENTS_TABLE)
    .update(payload)
    .eq("id", id)
    .select("id, name, file_url, file_name, file_size, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return { data: null, error: formatDocumentsError(error) };
  }

  return {
    data: data ? normalizeDocumentRow(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function deleteOrganizationDocument(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase.from(DOCUMENTS_TABLE).delete().eq("id", id);
  if (error) return { error: formatDocumentsError(error) };
  return { error: null };
}

export function formatDocumentAddedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDocumentFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(Number(bytes))) return "—";
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round((size / 1024) * 10) / 10} KB`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}
