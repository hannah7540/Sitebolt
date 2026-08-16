import { supabase, isSupabaseConfigured } from "./supabase";
import { sanitizeWritePayload } from "./form-payload-utils";
import { resolveProjectId } from "./project-resolver";
import { getItpTemplate, type ItpTemplate } from "./itp-templates";
import type {
  ItpItemStatus,
  ItpPointType,
  ItpStatus,
  ItpTradeCategory,
} from "./itp-templates";

export interface ProjectItpItem {
  id: string;
  itp_id: string;
  item_number: number;
  description: string;
  acceptance_criteria: string | null;
  point_type: ItpPointType;
  status: ItpItemStatus;
  photo_urls: string[];
  evidence_urls: string[];
  inspector_name: string | null;
  signed_off_at: string | null;
  signature_url: string | null;
  sort_order: number;
}

export interface ProjectItp {
  id: string;
  project_id: string;
  itp_number: string;
  title: string;
  revision: string;
  trade_category: string;
  subcontractor_name: string | null;
  location_area: string | null;
  status: ItpStatus;
  template_key: string | null;
  created_at?: string;
  updated_at?: string;
  items?: ProjectItpItem[];
}

export interface ItpDashboardStats {
  totalItps: number;
  openHoldPoints: number;
  completedItps: number;
  nonConformances: number;
}

export interface CreateItpInput {
  project_id: string;
  title: string;
  trade_category: string;
  subcontractor_name?: string;
  location_area?: string;
  revision?: string;
  template_key?: string;
  items?: Array<{
    item_number: number;
    description: string;
    acceptance_criteria?: string;
    point_type: ItpPointType;
  }>;
}

async function mutateItpViaApi<T>(
  url: string,
  init: RequestInit
): Promise<{ error: string | null; data?: T; useFallback: boolean }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 503) {
      return { error: null, useFallback: true };
    }

    const payload = (await response.json()) as { error?: string } & T;
    if (!response.ok) {
      return { error: payload.error ?? "Request failed", useFallback: false };
    }

    return { error: null, data: payload, useFallback: false };
  } catch {
    return { error: null, useFallback: true };
  }
}

function stripItpPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeWritePayload(
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  );
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function normalizeItem(row: Record<string, unknown>): ProjectItpItem {
  return {
    id: String(row.id ?? ""),
    itp_id: String(row.itp_id ?? ""),
    item_number: Number(row.item_number ?? 0),
    description: String(row.description ?? ""),
    acceptance_criteria: (row.acceptance_criteria as string | null) ?? null,
    point_type: (row.point_type as ItpPointType) ?? "S",
    status: (row.status as ItpItemStatus) ?? "pending",
    photo_urls: Array.isArray(row.photo_urls) ? (row.photo_urls as string[]) : [],
    evidence_urls: Array.isArray(row.evidence_urls) ? (row.evidence_urls as string[]) : [],
    inspector_name: (row.inspector_name as string | null) ?? null,
    signed_off_at: (row.signed_off_at as string | null) ?? null,
    signature_url: (row.signature_url as string | null) ?? null,
    sort_order: Number(row.sort_order ?? 0),
  };
}

function normalizeItp(row: Record<string, unknown>, items: ProjectItpItem[] = []): ProjectItp {
  return {
    id: String(row.id ?? ""),
    project_id: String(row.project_id ?? ""),
    itp_number: String(row.itp_number ?? ""),
    title: String(row.title ?? ""),
    revision: String(row.revision ?? "A"),
    trade_category: String(row.trade_category ?? ""),
    subcontractor_name: (row.subcontractor_name as string | null) ?? null,
    location_area: (row.location_area as string | null) ?? null,
    status: (row.status as ItpStatus) ?? "draft",
    template_key: (row.template_key as string | null) ?? null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
    items,
  };
}

async function resolveProject(projectId: string): Promise<string | null> {
  const { id } = await resolveProjectId(projectId);
  return id ?? projectId;
}

async function nextItpNumber(projectId: string): Promise<string> {
  const resolved = await resolveProject(projectId);
  const { data } = await supabase
    .from("project_itps")
    .select("itp_number")
    .eq("project_id", resolved ?? projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  const numbers = (data ?? [])
    .map((row) => String(row.itp_number ?? ""))
    .map((value) => {
      const match = value.match(/(\d+)\s*$/);
      return match ? Number(match[1]) : 0;
    });

  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  return `ITP-${String(next).padStart(3, "0")}`;
}

export async function fetchProjectItps(projectId: string): Promise<ProjectItp[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const resolved = await resolveProject(projectId);
    const { data, error } = await supabase
      .from("project_itps")
      .select("*")
      .eq("project_id", resolved ?? projectId)
      .order("created_at", { ascending: false });

    if (error) {
      if (!isMissingTableError(error.message, "project_itps")) {
        console.warn("fetchProjectItps failed:", error.message);
      }
      return [];
    }

    return (data ?? []).map((row) => normalizeItp(row as Record<string, unknown>));
  } catch (error) {
    console.warn("fetchProjectItps threw:", error);
    return [];
  }
}

export async function fetchItpById(itpId: string): Promise<ProjectItp | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data: itpRow, error } = await supabase
      .from("project_itps")
      .select("*")
      .eq("id", itpId)
      .maybeSingle();

    if (error || !itpRow) return null;

    const { data: itemRows } = await supabase
      .from("project_itp_items")
      .select("*")
      .eq("itp_id", itpId)
      .order("sort_order")
      .order("item_number");

    const items = (itemRows ?? []).map((row) =>
      normalizeItem(row as Record<string, unknown>)
    );

    return normalizeItp(itpRow as Record<string, unknown>, items);
  } catch {
    return null;
  }
}

export async function fetchItpDashboardStats(projectId: string): Promise<ItpDashboardStats> {
  const itps = await fetchProjectItps(projectId);
  if (itps.length === 0) {
    return { totalItps: 0, openHoldPoints: 0, completedItps: 0, nonConformances: 0 };
  }

  const itpIds = itps.map((itp) => itp.id);
  const { data: itemRows } = await supabase
    .from("project_itp_items")
    .select("point_type, status")
    .in("itp_id", itpIds);

  const items = (itemRows ?? []) as Array<{ point_type: ItpPointType; status: ItpItemStatus }>;

  return {
    totalItps: itps.length,
    openHoldPoints: items.filter(
      (item) =>
        item.point_type === "H" &&
        (item.status === "pending" || item.status === "non_conforming")
    ).length,
    completedItps: itps.filter((itp) => itp.status === "approved").length,
    nonConformances: items.filter((item) => item.status === "non_conforming").length,
  };
}

export async function createProjectItp(
  input: CreateItpInput
): Promise<{ error: string | null; itp?: ProjectItp }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const apiResult = await mutateItpViaApi<{ itpId?: string }>("/api/itp", {
    method: "POST",
    body: JSON.stringify(input),
  });

  if (!apiResult.useFallback) {
    if (apiResult.error) return { error: apiResult.error };
    const itp = apiResult.data?.itpId ? await fetchItpById(apiResult.data.itpId) : null;
    return { error: null, itp: itp ?? undefined };
  }

  try {
    const resolvedProjectId = await resolveProject(input.project_id);
    const itpNumber = await nextItpNumber(input.project_id);

    let items = input.items ?? [];
    if (input.template_key && items.length === 0) {
      const template = getItpTemplate(input.template_key);
      if (template) {
        items = template.items.map((item) => ({
          item_number: item.item_number,
          description: item.description,
          acceptance_criteria: item.acceptance_criteria,
          point_type: item.point_type,
        }));
      }
    }

    const { data: itpRow, error: itpError } = await supabase
      .from("project_itps")
      .insert(
        stripItpPayload({
          project_id: resolvedProjectId ?? input.project_id,
          itp_number: itpNumber,
          title: input.title.trim(),
          revision: input.revision?.trim() || "A",
          trade_category: input.trade_category,
          subcontractor_name: input.subcontractor_name?.trim() || null,
          location_area: input.location_area?.trim() || null,
          status: "draft",
          template_key: input.template_key ?? null,
        })
      )
      .select("*")
      .single();

    if (itpError || !itpRow) return { error: itpError?.message ?? "Failed to create ITP" };

    if (items.length > 0) {
      const payload = items.map((item, index) =>
        stripItpPayload({
          itp_id: itpRow.id,
          item_number: item.item_number,
          description: item.description,
          acceptance_criteria: item.acceptance_criteria ?? null,
          point_type: item.point_type,
          status: "pending",
          sort_order: index,
        })
      );

      const { error: itemsError } = await supabase.from("project_itp_items").insert(payload);
      if (itemsError) {
        await supabase.from("project_itps").delete().eq("id", itpRow.id);
        return { error: itemsError.message };
      }
    }

    const itp = await fetchItpById(String(itpRow.id));
    return { error: null, itp: itp ?? undefined };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to create ITP" };
  }
}

export async function cloneItpFromTemplate(
  projectId: string,
  template: ItpTemplate,
  overrides?: Partial<CreateItpInput>
): Promise<{ error: string | null; itp?: ProjectItp }> {
  return createProjectItp({
    project_id: projectId,
    title: overrides?.title ?? template.title,
    trade_category: overrides?.trade_category ?? template.trade_category,
    template_key: template.key,
    subcontractor_name: overrides?.subcontractor_name,
    location_area: overrides?.location_area,
    revision: overrides?.revision ?? "A",
    items: template.items.map((item) => ({
      item_number: item.item_number,
      description: item.description,
      acceptance_criteria: item.acceptance_criteria,
      point_type: item.point_type,
    })),
  });
}

export async function updateItpStatus(
  itpId: string,
  status: ItpStatus
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  if (status === "submitted" || status === "approved") {
    const itp = await fetchItpById(itpId);
    if (itp && hasBlockingHoldPoints(itp.items ?? [])) {
      return {
        error: "Cannot submit or approve while Hold Points are pending or non-conforming.",
      };
    }
  }

  const apiResult = await mutateItpViaApi<{ ok?: boolean }>("/api/itp/status", {
    method: "PATCH",
    body: JSON.stringify({ itpId, status }),
  });

  if (!apiResult.useFallback) {
    return { error: apiResult.error };
  }

  const { error } = await supabase
    .from("project_itps")
    .update(stripItpPayload({ status, updated_at: new Date().toISOString() }))
    .eq("id", itpId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function updateItpItemStatus(
  itemId: string,
  status: ItpItemStatus
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const apiResult = await mutateItpViaApi<{ ok?: boolean }>("/api/itp/items", {
    method: "PATCH",
    body: JSON.stringify({ itemId, patch: { status } }),
  });

  if (!apiResult.useFallback) {
    return { error: apiResult.error };
  }

  const { error } = await supabase
    .from("project_itp_items")
    .update(stripItpPayload({ status, updated_at: new Date().toISOString() }))
    .eq("id", itemId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function signOffItpItem(input: {
  itemId: string;
  inspectorName: string;
  signatureUrl: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const patch = {
    inspector_name: input.inspectorName.trim(),
    signature_url: input.signatureUrl,
    signed_off_at: new Date().toISOString(),
  };

  const apiResult = await mutateItpViaApi<{ ok?: boolean }>("/api/itp/items", {
    method: "PATCH",
    body: JSON.stringify({ itemId: input.itemId, patch }),
  });

  if (!apiResult.useFallback) {
    return { error: apiResult.error };
  }

  const { error } = await supabase
    .from("project_itp_items")
    .update(stripItpPayload({ ...patch, updated_at: new Date().toISOString() }))
    .eq("id", input.itemId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function appendItpItemPhoto(
  itemId: string,
  photoUrl: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { data, error: readError } = await supabase
    .from("project_itp_items")
    .select("photo_urls")
    .eq("id", itemId)
    .maybeSingle();

  if (readError || !data) return { error: readError?.message ?? "Item not found" };

  const photos = Array.isArray(data.photo_urls) ? [...(data.photo_urls as string[])] : [];
  photos.push(photoUrl);

  const apiResult = await mutateItpViaApi<{ ok?: boolean }>("/api/itp/items", {
    method: "PATCH",
    body: JSON.stringify({ itemId, patch: { photo_urls: photos } }),
  });

  if (!apiResult.useFallback) {
    return { error: apiResult.error };
  }

  const { error } = await supabase
    .from("project_itp_items")
    .update(stripItpPayload({ photo_urls: photos, updated_at: new Date().toISOString() }))
    .eq("id", itemId);

  if (error) return { error: error.message };
  return { error: null };
}

export function hasBlockingHoldPoints(items: ProjectItpItem[]): boolean {
  return items.some(
    (item) =>
      item.point_type === "H" &&
      (item.status === "pending" || item.status === "non_conforming")
  );
}

export function getBlockingHoldPointItems(items: ProjectItpItem[]): ProjectItpItem[] {
  return items.filter(
    (item) =>
      item.point_type === "H" &&
      (item.status === "pending" || item.status === "non_conforming")
  );
}

export async function markItpInProgress(itpId: string): Promise<void> {
  const itp = await fetchItpById(itpId);
  if (itp?.status === "draft") {
    await updateItpStatus(itpId, "in_progress");
  }
}

export type { ItpTemplate, ItpStatus, ItpTradeCategory };
