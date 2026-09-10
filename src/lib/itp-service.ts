import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId } from "./project-resolver";
import { getItpTemplate, type ItpTemplate } from "./itp-templates";
import type {
  ItpItemStatus,
  ItpPointType,
  ItpStatus,
  ItpTradeCategory,
} from "./itp-templates";
import {
  PROJECT_ITP_COLUMNS,
  PROJECT_ITP_ITEM_COLUMNS,
  PROJECT_ITP_ITEMS_TABLE,
  PROJECT_ITPS_TABLE,
  asUnknownArray,
  hydrateItpItcRow,
  retryItpItcWrite,
  retryItpItcWriteMany,
  sanitizeItpItcWritePayload,
} from "./itp-itc-payload";

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

function stripItpPayload(
  payload: Record<string, unknown>,
  columns: readonly string[] = PROJECT_ITP_COLUMNS,
  complete = false
): Record<string, unknown> {
  return sanitizeItpItcWritePayload(payload, columns, { complete });
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
  const hydrated = hydrateItpItcRow(row);
  const photos = Array.isArray(hydrated.photo_urls)
    ? (hydrated.photo_urls as string[])
    : Array.isArray(hydrated.photos)
      ? (hydrated.photos as string[])
      : [];
  return {
    id: String(hydrated.id ?? ""),
    itp_id: String(hydrated.itp_id ?? ""),
    item_number: Number(hydrated.item_number ?? 0),
    description: String(hydrated.description ?? ""),
    acceptance_criteria: (hydrated.acceptance_criteria as string | null) ?? null,
    point_type: (hydrated.point_type as ItpPointType) ?? "S",
    status: (hydrated.status as ItpItemStatus) ?? "pending",
    photo_urls: photos,
    evidence_urls: Array.isArray(hydrated.evidence_urls)
      ? (hydrated.evidence_urls as string[])
      : [],
    inspector_name: (hydrated.inspector_name as string | null) ?? null,
    signed_off_at: (hydrated.signed_off_at as string | null) ?? null,
    signature_url: (hydrated.signature_url as string | null) ?? null,
    sort_order: Number(hydrated.sort_order ?? 0),
  };
}

function normalizeItp(row: Record<string, unknown>, items: ProjectItpItem[] = []): ProjectItp {
  const hydrated = hydrateItpItcRow(row);
  return {
    id: String(hydrated.id ?? ""),
    project_id: String(hydrated.project_id ?? ""),
    itp_number: String(hydrated.itp_number ?? ""),
    title: String(hydrated.title ?? ""),
    revision: String(hydrated.revision ?? "A"),
    trade_category: String(hydrated.trade_category ?? ""),
    subcontractor_name: (hydrated.subcontractor_name as string | null) ?? null,
    location_area: (hydrated.location_area as string | null) ?? null,
    status: (hydrated.status as ItpStatus) ?? "draft",
    template_key: (hydrated.template_key as string | null) ?? null,
    created_at: hydrated.created_at as string | undefined,
    updated_at: hydrated.updated_at as string | undefined,
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
    .from(PROJECT_ITPS_TABLE)
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
      .from(PROJECT_ITPS_TABLE)
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
      .from(PROJECT_ITPS_TABLE)
      .select("*")
      .eq("id", itpId)
      .maybeSingle();

    if (error || !itpRow) return null;

    const hydrated = hydrateItpItcRow(itpRow as Record<string, unknown>);
    const { data: itemRows } = await supabase
      .from(PROJECT_ITP_ITEMS_TABLE)
      .select("*")
      .eq("itp_id", itpId)
      .order("sort_order")
      .order("item_number");

    const storedItems = (itemRows ?? []).map((row) =>
      normalizeItem(row as Record<string, unknown>)
    );
    const fallbackItems = asUnknownArray(hydrated.items ?? hydrated.checklist).map((item, index) =>
      normalizeItem({
        ...(typeof item === "object" && item ? (item as Record<string, unknown>) : {}),
        itp_id: itpId,
        sort_order: index,
      })
    );
    const items = storedItems.length > 0 ? storedItems : fallbackItems.filter((item) => item.description);

    return normalizeItp(hydrated, items);
  } catch {
    return null;
  }
}

export async function fetchItpDashboardStats(projectId: string): Promise<ItpDashboardStats> {
  try {
    const itps = await fetchProjectItps(projectId);
    if (itps.length === 0) {
      return { totalItps: 0, openHoldPoints: 0, completedItps: 0, nonConformances: 0 };
    }

    const itpIds = itps.map((itp) => itp.id);
    const { data: itemRows } = await supabase
      .from(PROJECT_ITP_ITEMS_TABLE)
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
      completedItps: itps.filter(
        (itp) => itp.status === "approved" || itp.status === "completed"
      ).length,
      nonConformances: items.filter((item) => item.status === "non_conforming").length,
    };
  } catch (error) {
    console.warn("fetchItpDashboardStats threw:", error);
    return { totalItps: 0, openHoldPoints: 0, completedItps: 0, nonConformances: 0 };
  }
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

    const headerPayload = stripItpPayload({
          project_id: resolvedProjectId ?? input.project_id,
          itp_number: itpNumber,
          title: input.title.trim(),
          revision: input.revision?.trim() || "A",
          trade_category: input.trade_category,
          subcontractor_name: input.subcontractor_name?.trim() || null,
          location_area: input.location_area?.trim() || null,
          status: "draft",
          template_key: input.template_key ?? null,
          form_data: { items, checklist: items },
        });

    const insertResult = await retryItpItcWrite(
      "project_itps.insert",
      headerPayload,
      async (payload) => {
        const { data, error } = await supabase
          .from(PROJECT_ITPS_TABLE)
          .insert(payload)
          .select("*")
          .single();
        return { data, error };
      }
    );

    if (insertResult.error || !insertResult.data) {
      return { error: insertResult.error ?? "Failed to create ITP" };
    }
    const itpRow = insertResult.data as { id: string };

    if (items.length > 0) {
      const payload = items.map((item, index) =>
        stripItpPayload(
          {
            itp_id: itpRow.id,
            item_number: item.item_number,
            description: item.description,
            acceptance_criteria: item.acceptance_criteria ?? null,
            point_type: item.point_type,
            status: "pending",
            sort_order: index,
            photo_urls: [],
            checklist: [],
            form_data: {},
          },
          PROJECT_ITP_ITEM_COLUMNS
        )
      );

      const itemsResult = await retryItpItcWriteMany(
        "project_itp_items.insert",
        payload,
        async (rows) => {
          const { error } = await supabase.from(PROJECT_ITP_ITEMS_TABLE).insert(rows);
          return { error };
        }
      );
      if (itemsResult.error) {
        await supabase.from(PROJECT_ITPS_TABLE).delete().eq("id", itpRow.id);
        return { error: itemsResult.error };
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

  const complete =
    status === "submitted" || status === "approved" || status === "completed";
  const payload = stripItpPayload(
    {
      status,
      updated_at: new Date().toISOString(),
      completed_at: complete ? new Date().toISOString() : undefined,
    },
    PROJECT_ITP_COLUMNS,
    status === "completed"
  );

  const result = await retryItpItcWrite("project_itps.status", payload, async (next) => {
    const { error } = await supabase.from(PROJECT_ITPS_TABLE).update(next).eq("id", itpId);
    return { error };
  });
  return { error: result.error };
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

  const result = await retryItpItcWrite(
    "project_itp_items.status",
    stripItpPayload(
      { status, updated_at: new Date().toISOString() },
      PROJECT_ITP_ITEM_COLUMNS
    ),
    async (next) => {
      const { error } = await supabase.from(PROJECT_ITP_ITEMS_TABLE).update(next).eq("id", itemId);
      return { error };
    }
  );
  return { error: result.error };
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

  const result = await retryItpItcWrite(
    "project_itp_items.signoff",
    stripItpPayload(
      { ...patch, updated_at: new Date().toISOString() },
      PROJECT_ITP_ITEM_COLUMNS
    ),
    async (next) => {
      const { error } = await supabase.from(PROJECT_ITP_ITEMS_TABLE).update(next).eq("id", input.itemId);
      return { error };
    }
  );
  return { error: result.error };
}

export async function appendItpItemPhoto(
  itemId: string,
  photoUrl: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { data, error: readError } = await supabase
    .from(PROJECT_ITP_ITEMS_TABLE)
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

  const result = await retryItpItcWrite(
    "project_itp_items.photos",
    stripItpPayload(
      { photo_urls: photos, photos, updated_at: new Date().toISOString() },
      PROJECT_ITP_ITEM_COLUMNS
    ),
    async (next) => {
      const { error } = await supabase.from(PROJECT_ITP_ITEMS_TABLE).update(next).eq("id", itemId);
      return { error };
    }
  );
  return { error: result.error };
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
