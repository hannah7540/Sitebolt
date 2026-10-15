/**
 * Red line markup API — upload drawings to the private `redline-drawings`
 * bucket and persist ITC run geometry on `itc_redlines`.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { resolveActiveOrganisationId } from "@/lib/tenant-scope";
import { readSupabaseAnonKey, readSupabaseUrl } from "@/lib/supabase/env";
import type { RedlineLabel, RedlineSeg } from "@/lib/redline-geometry";

export const REDLINE_DRAWINGS_BUCKET = "redline-drawings";

export type RedlineReview = "pending" | "accepted" | "rejected";
export type RedlineSourceKind = "field" | "office";

export interface RedlineMe {
  authUserId: string;
  workerId: string | null;
  name: string;
}

export interface RedlineItcOption {
  id: string;
  number: string;
  type: string;
  issued: boolean;
}

export interface RedlineSourceRecord {
  id: string;
  file_name: string;
  file_size: number;
  page_count: number;
  storage_path: string;
  organisation_id: string | null;
}

export interface RedlineRun {
  id?: string;
  itc_id: string;
  source_id: string;
  segs: RedlineSeg[];
  page: number;
  width: number;
  opacity: number;
  label: RedlineLabel | null;
  drawn_by: string;
  drawn_by_name: string;
  drawn_at: string;
  source: RedlineSourceKind;
  review: RedlineReview;
}

export interface SaveRedlineInput {
  id?: string;
  itc_id: string;
  source_id: string;
  segs: RedlineSeg[];
  page: number;
  width: number;
  opacity: number;
  label: RedlineLabel | null;
  source?: RedlineSourceKind;
  review?: RedlineReview;
  drawn_by_name?: string;
  drawn_by_worker_id?: string | null;
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSource(row: Record<string, unknown>): RedlineSourceRecord {
  return {
    id: String(row.id),
    file_name: asText(row.file_name) ?? "drawing.pdf",
    file_size: asNumber(row.file_size) ?? 0,
    page_count: asNumber(row.page_count) ?? 1,
    storage_path: asText(row.storage_path) ?? "",
    organisation_id: asText(row.organisation_id),
  };
}

function mapRun(row: Record<string, unknown>): RedlineRun {
  const segs = Array.isArray(row.segs) ? (row.segs as RedlineSeg[]) : [];
  const label =
    row.label && typeof row.label === "object"
      ? (row.label as RedlineLabel)
      : null;
  const source = asText(row.source) === "office" ? "office" : "field";
  const reviewRaw = asText(row.review);
  const review: RedlineReview =
    reviewRaw === "accepted" || reviewRaw === "rejected" ? reviewRaw : "pending";
  return {
    id: asText(row.id) ?? undefined,
    itc_id: String(row.itc_id),
    source_id: String(row.source_id),
    segs,
    page: asNumber(row.page) ?? 1,
    width: asNumber(row.width) ?? 0.004,
    opacity: asNumber(row.opacity) ?? 0.4,
    label,
    drawn_by: asText(row.drawn_by) ?? "",
    drawn_by_name: asText(row.drawn_by_name) ?? "Worker",
    drawn_at: asText(row.drawn_at) ?? new Date().toISOString(),
    source,
    review,
  };
}

async function requireSession(): Promise<{
  userId: string;
  accessToken: string;
}> {
  const { data, error } = await supabase.auth.getSession();
  const session = data.session;
  if (error || !session?.user?.id || !session.access_token) {
    throw new Error("Sign in to upload a drawing.");
  }
  return { userId: session.user.id, accessToken: session.access_token };
}

function requireOrgId(): string {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    throw new Error("No active organisation. Switch company and try again.");
  }
  return orgId;
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function parseUploadError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    if (parsed.message) return parsed.message;
    if (parsed.error) return parsed.error;
  } catch {
    // Fall through to the raw body / status.
  }
  return body.trim() || `Upload failed (${status})`;
}

/**
 * Upload a private object with byte-level progress via XHR.
 * Supabase JS `storage.upload` does not expose `onUploadProgress`.
 */
function uploadFileWithProgress(input: {
  bucket: string;
  path: string;
  file: File;
  accessToken: string;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${readSupabaseUrl()}/storage/v1/object/${input.bucket}/${encodeStoragePath(input.path)}`;
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${input.accessToken}`);
    xhr.setRequestHeader("apikey", readSupabaseAnonKey());
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "3600");
    xhr.setRequestHeader("Content-Type", input.file.type || "application/pdf");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !input.onProgress) return;
      const pct = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      input.onProgress(pct);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        input.onProgress?.(100);
        resolve();
        return;
      }
      reject(new Error(parseUploadError(xhr.responseText, xhr.status)));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading the drawing."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(input.file);
  });
}

async function findExistingSource(input: {
  organisationId: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
}): Promise<RedlineSourceRecord | null> {
  const { data, error } = await supabase
    .from("redline_sources")
    .select("id, file_name, file_size, page_count, storage_path, organisation_id")
    .eq("organisation_id", input.organisationId)
    .eq("file_name", input.fileName)
    .eq("file_size", input.fileSize)
    .eq("page_count", input.pageCount)
    .maybeSingle();

  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message)) {
      throw new Error("Redline tables are not installed yet. Run migration 186_redline_markup.sql.");
    }
    return null;
  }
  return data ? mapSource(asRecord(data)) : null;
}

export async function getRedlineUrl(sourceId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !sourceId.trim()) return null;
  const { data, error } = await supabase
    .from("redline_sources")
    .select("storage_path")
    .eq("id", sourceId)
    .maybeSingle();
  if (error || !data) return null;
  const path = asText(asRecord(data).storage_path);
  if (!path) return null;
  const signed = await supabase.storage
    .from(REDLINE_DRAWINGS_BUCKET)
    .createSignedUrl(path, 60 * 60 * 12);
  return signed.data?.signedUrl ?? null;
}

export async function listRedlines(sourceId: string): Promise<RedlineRun[]> {
  if (!isSupabaseConfigured() || !sourceId.trim()) return [];
  const { data, error } = await supabase
    .from("itc_redlines")
    .select("*")
    .eq("source_id", sourceId)
    .order("drawn_at", { ascending: true });
  if (error) {
    console.warn("[redline] listRedlines:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapRun(asRecord(row)));
}

export async function saveRedline(run: SaveRedlineInput): Promise<{ run: RedlineRun | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { run: null, error: "Supabase is not configured." };
  }
  try {
    const { userId } = await requireSession();
    const orgId = requireOrgId();
    const segs = run.segs.filter((seg) => seg.length > 0);
    if (!segs.length) return { run: null, error: "A run needs at least one point." };

    const payload: Record<string, unknown> = {
      organisation_id: orgId,
      itc_id: run.itc_id,
      source_id: run.source_id,
      page: run.page,
      segs,
      width: run.width,
      opacity: run.opacity,
      label: run.label,
      source: run.source ?? "field",
      review: run.review ?? "pending",
      drawn_by: userId,
      drawn_by_name: run.drawn_by_name ?? null,
      drawn_by_worker_id: run.drawn_by_worker_id ?? null,
      drawn_at: new Date().toISOString(),
    };
    if (run.id) payload.id = run.id;

    const { data, error } = await supabase
      .from("itc_redlines")
      .upsert(payload, { onConflict: "itc_id,source_id" })
      .select("*")
      .maybeSingle();

    if (error) return { run: null, error: error.message };
    return { run: data ? mapRun(asRecord(data)) : null, error: null };
  } catch (error) {
    return {
      run: null,
      error: error instanceof Error ? error.message : "Could not save the run.",
    };
  }
}

export async function deleteRedline(id: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured() || !id.trim()) {
    return { error: "Missing redline id." };
  }
  const { error } = await supabase.from("itc_redlines").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function uploadRedlineSource(
  file: File,
  options: {
    pageCount: number;
    onProgress?: (percent: number) => void;
  }
): Promise<{ source: RedlineSourceRecord; reused: boolean }> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  if (!file || file.size <= 0) {
    throw new Error("Choose a PDF drawing to upload.");
  }
  const pageCount = Math.max(1, Math.floor(options.pageCount || 1));
  options.onProgress?.(0);

  const { userId, accessToken } = await requireSession();
  const orgId = requireOrgId();

  const existing = await findExistingSource({
    organisationId: orgId,
    fileName: file.name,
    fileSize: file.size,
    pageCount,
  });
  if (existing) {
    options.onProgress?.(100);
    return { source: existing, reused: true };
  }

  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storagePath = `${orgId}/${id}.pdf`;

  await uploadFileWithProgress({
    bucket: REDLINE_DRAWINGS_BUCKET,
    path: storagePath,
    file,
    accessToken,
    onProgress: (pct) => options.onProgress?.(Math.min(95, pct)),
  });

  options.onProgress?.(96);

  const { data, error } = await supabase
    .from("redline_sources")
    .insert({
      id,
      organisation_id: orgId,
      file_name: file.name,
      file_size: file.size,
      page_count: pageCount,
      storage_path: storagePath,
      uploaded_by: userId,
    })
    .select("id, file_name, file_size, page_count, storage_path, organisation_id")
    .maybeSingle();

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      const again = await findExistingSource({
        organisationId: orgId,
        fileName: file.name,
        fileSize: file.size,
        pageCount,
      });
      if (again) {
        options.onProgress?.(100);
        return { source: again, reused: true };
      }
    }
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Upload succeeded but the drawing record was not saved.");
  }

  options.onProgress?.(100);
  return { source: mapSource(asRecord(data)), reused: false };
}
