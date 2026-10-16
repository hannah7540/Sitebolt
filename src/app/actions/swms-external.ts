"use server";

import { revalidatePath } from "next/cache";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import { isValidSwmsId } from "@/lib/supabase";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";
import { createSwmsStorageSignedUrlWithClient } from "@/lib/swms-external-storage";
import {
  EXTERNAL_SWMS_MAX_BYTES,
  SWMS_DOCUMENTS_BUCKET,
  sanitizeSwmsStorageKey,
} from "@/lib/swms-external";

const OPTIONAL_INSERT_COLUMNS = [
  "document_url",
  "doc_url",
  "file_name",
  "issue_date",
  "date",
  "is_archived",
  "status",
  "swms_scope",
  "version",
  "project_id",
  "organisation_id",
] as const;

function requireAdmin() {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("Server database access is not configured.");
  }
  return createSupabaseAdminClient();
}

async function requireSignedInUser() {
  const server = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await server.auth.getUser();
  if (error || !user) {
    return { user: null, error: "You must be signed in to upload an external SWMS." };
  }
  return { user, error: null };
}

export async function getExternalSwmsDocumentUrl(
  storagePath: string
): Promise<{ url: string; error: string | null }> {
  const auth = await requireSignedInUser();
  if (!auth.user) {
    return { url: "", error: auth.error };
  }

  try {
    const url = await createSwmsStorageSignedUrlWithClient(requireAdmin(), storagePath);
    if (!url) {
      return { url: "", error: "Could not create a document URL." };
    }
    return { url, error: null };
  } catch (error) {
    return {
      url: "",
      error: error instanceof Error ? error.message : "Could not create a document URL.",
    };
  }
}

export async function uploadExternalSwms(formData: FormData): Promise<{
  error: string | null;
  documentId: string | null;
}> {
  const auth = await requireSignedInUser();
  if (!auth.user) {
    return { error: auth.error, documentId: null };
  }

  const orgId = await resolveActiveOrganisationIdFromCookies();
  if (!orgId) {
    return { error: "Select an organisation before uploading a SWMS.", documentId: null };
  }

  const title = String(formData.get("title") ?? "").trim();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const scope = String(formData.get("scope") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const file = formData.get("file");

  if (!title) {
    return { error: "SWMS title is required.", documentId: null };
  }
  if (!companyName) {
    return { error: "Builder / company name is required.", documentId: null };
  }
  if (scope !== "company" && scope !== "project") {
    return { error: "Select a scope: company or project.", documentId: null };
  }
  if (scope === "project" && !isValidSwmsId(projectId)) {
    return { error: "Select a valid project.", documentId: null };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Upload a SWMS PDF.", documentId: null };
  }
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return { error: "SWMS file must be a PDF.", documentId: null };
  }
  if (file.size > EXTERNAL_SWMS_MAX_BYTES) {
    return { error: "PDF must be 25 MB or smaller.", documentId: null };
  }

  let admin;
  try {
    admin = requireAdmin();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Server database access is not configured.",
      documentId: null,
    };
  }

  const documentId = crypto.randomUUID();
  const storagePath = `${orgId}/external/${documentId}-${sanitizeSwmsStorageKey(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(SWMS_DOCUMENTS_BUCKET)
    .upload(storagePath, buffer, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });

  if (uploadError) {
    return {
      error: uploadError.message || "Failed to upload the SWMS PDF.",
      documentId: null,
    };
  }

  const { data: publicUrlData } = admin.storage
    .from(SWMS_DOCUMENTS_BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = publicUrlData.publicUrl;
  const today = new Date().toISOString().slice(0, 10);

  let payload: Record<string, unknown> = {
    id: documentId,
    title,
    external_company_name: companyName,
    is_external: true,
    storage_path: storagePath,
    file_url: publicUrl,
    doc_url: publicUrl,
    document_url: publicUrl,
    file_name: file.name,
    document_date: today,
    issue_date: today,
    date: today,
    is_archived: false,
    status: "Active",
    swms_scope: scope === "project" ? "site_specific" : "company",
    version: "1.0",
    organisation_id: orgId,
  };
  if (scope === "project") {
    payload.project_id = projectId;
  }

  for (let attempt = 0; attempt <= OPTIONAL_INSERT_COLUMNS.length + 2; attempt += 1) {
    const { error } = await admin.from("swms").insert([payload]);
    if (!error) {
      revalidatePath("/admin/swms");
      return { error: null, documentId };
    }

    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload && OPTIONAL_INSERT_COLUMNS.includes(missing as (typeof OPTIONAL_INSERT_COLUMNS)[number])) {
      payload = stripMissingColumn(payload, missing);
      continue;
    }

    return { error: error.message, documentId: null };
  }

  return { error: "Failed to save the external SWMS.", documentId: null };
}
