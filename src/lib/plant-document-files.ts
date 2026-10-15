import { supabase, isSupabaseConfigured } from "./supabase";
import { PLANT_DOCUMENTS_BUCKET } from "./plant-doc-upload";
import { resolveActiveOrganisationId } from "./tenant-scope";

export interface PlantDocumentFile {
  id: string;
  plant_id: string;
  file_name: string;
  storage_path: string;
  file_url: string | null;
  created_at: string | null;
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function isMissingRelation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("plant_documents") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function sanitizeFileName(name: string): string {
  return (name || "document").replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function resolveFileUrl(storagePath: string): Promise<string | null> {
  if (!storagePath.trim()) return null;
  if (/^https?:\/\//i.test(storagePath)) return storagePath;

  const signed = await supabase.storage
    .from(PLANT_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60 * 24);
  if (signed.data?.signedUrl) return signed.data.signedUrl;

  const { data } = supabase.storage.from(PLANT_DOCUMENTS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl || null;
}

function mapRow(row: Record<string, unknown>, fileUrl: string | null): PlantDocumentFile {
  return {
    id: String(row.id ?? ""),
    plant_id: String(row.plant_id ?? ""),
    file_name: String(row.file_name ?? "Document"),
    storage_path: String(row.storage_path ?? ""),
    file_url: fileUrl,
    created_at: row.created_at ? String(row.created_at) : null,
  };
}

export async function listPlantDocumentFiles(plantId: string): Promise<PlantDocumentFile[]> {
  if (!isSupabaseConfigured() || !plantId.trim()) return [];

  const { data, error } = await supabase
    .from("plant_documents")
    .select("id, plant_id, file_name, storage_path, created_at")
    .eq("plant_id", plantId)
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingRelation(error.message)) {
      console.warn("[plant_documents] list:", error.message);
    }
    return [];
  }

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => {
      const record = asRecord(row);
      const path = String(record.storage_path ?? "");
      return mapRow(record, await resolveFileUrl(path));
    })
  );
}

export async function uploadPlantDocumentFile(input: {
  plantId: string;
  file: File;
}): Promise<{ document: PlantDocumentFile | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { document: null, error: "Supabase is not configured." };
  }
  if (!input.plantId.trim() || !input.file) {
    return { document: null, error: "Choose a file to upload." };
  }

  const orgId = resolveActiveOrganisationId();
  const safeName = sanitizeFileName(input.file.name);
  const storagePath = `${orgId ? `${orgId}/` : ""}${input.plantId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(PLANT_DOCUMENTS_BUCKET)
    .upload(storagePath, input.file, {
      upsert: false,
      contentType: input.file.type || undefined,
    });

  if (uploadError) {
    return { document: null, error: uploadError.message };
  }

  const { data, error } = await supabase
    .from("plant_documents")
    .insert({
      plant_id: input.plantId,
      file_name: input.file.name,
      storage_path: storagePath,
    })
    .select("id, plant_id, file_name, storage_path, created_at")
    .maybeSingle();

  if (error) {
    return { document: null, error: error.message };
  }

  const record = asRecord(data);
  return {
    document: mapRow(record, await resolveFileUrl(storagePath)),
    error: null,
  };
}
