import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchProjects, getProjectDisplayName, type DbProject } from "./project-resolver";
import {
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";
import { resolveWorkerName } from "./leave-requests";
import type { Worker } from "./supabase";

export const WORKER_REQUESTS_TABLE = "worker_requests";

export type WorkerRequestType = "Uniform" | "Tools" | "Job Specific Equipment";
export type WorkerRequestStatus = "Pending" | "In Progress" | "Fulfilled";

export const WORKER_REQUEST_TYPES: WorkerRequestType[] = [
  "Uniform",
  "Tools",
  "Job Specific Equipment",
];

export const UNIFORM_ITEM_OPTIONS = [
  "Long Sleeve Cotton Drill Shirts",
  "Short Sleeve Cotton Drill Shirts",
  "Short Sleeve Polo Shirts",
  "Jumpers",
] as const;

export const UNIFORM_SIZE_OPTIONS = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
] as const;

export type UniformItem = (typeof UNIFORM_ITEM_OPTIONS)[number];
export type UniformSize = (typeof UNIFORM_SIZE_OPTIONS)[number];

export interface UniformLineItem {
  item: string;
  size: string;
  quantity: number;
}

export interface WorkerRequestRecord {
  id: string;
  request_number: string;
  worker_id: string;
  worker_name: string;
  project_id: string | null;
  project_name: string | null;
  request_type: WorkerRequestType;
  uniform_item: string | null;
  uniform_size: string | null;
  quantity: number;
  uniform_items: UniformLineItem[];
  description: string | null;
  status: WorkerRequestStatus;
  admin_comments: string | null;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerRequestProjectOption {
  id: string;
  name: string;
}

export interface SubmitWorkerRequestInput {
  workerId: string;
  workerName: string;
  projectId: string | null;
  projectName?: string | null;
  requestType: WorkerRequestType;
  /** @deprecated Use uniformItems for multi-item uniform requests */
  uniformItem?: string | null;
  /** @deprecated Use uniformItems for multi-item uniform requests */
  uniformSize?: string | null;
  quantity?: number;
  uniformItems?: UniformLineItem[];
  description?: string | null;
}

export interface UpdateWorkerRequestInput {
  requestId: string;
  status?: WorkerRequestStatus;
  adminComments?: string | null;
  fulfilledBy?: string | null;
}

const LOCAL_REQUESTS_KEY = "sitebolt_worker_requests_local";

function stripUndefinedFields(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

function formatRequestCode(sequence: number): string {
  const safe = Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return `REQ-${String(safe).padStart(4, "0")}`;
}

function normalizeRequestStatus(value: unknown): WorkerRequestStatus {
  const status = String(value ?? "Pending").trim();
  if (status === "In Progress") return "In Progress";
  if (status === "Fulfilled") return "Fulfilled";
  return "Pending";
}

function normalizeRequestType(value: unknown): WorkerRequestType {
  const type = String(value ?? "").trim();
  if (type === "Tools" || type === "Job Specific Equipment") return type;
  return "Uniform";
}

function normalizeUniformItems(raw: unknown): UniformLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items: UniformLineItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const item = String(row.item ?? row.uniform_item ?? "").trim();
    const size = String(row.size ?? row.uniform_size ?? "").trim();
    const quantity = Math.max(1, Math.floor(Number(row.quantity ?? 1) || 1));
    if (!item || !size) continue;
    items.push({ item, size, quantity });
  }
  return items;
}

function resolveUniformItemsFromRow(row: Record<string, unknown>): UniformLineItem[] {
  const fromJson = normalizeUniformItems(row.uniform_items);
  if (fromJson.length > 0) return fromJson;

  const legacyItem = row.uniform_item ? String(row.uniform_item).trim() : "";
  const legacySize = row.uniform_size ? String(row.uniform_size).trim() : "";
  if (legacyItem && legacySize) {
    return [
      {
        item: legacyItem,
        size: legacySize,
        quantity: Math.max(1, Math.floor(Number(row.quantity ?? 1) || 1)),
      },
    ];
  }

  return [];
}

export function createEmptyUniformLineItem(): UniformLineItem {
  return { item: "", size: "", quantity: 1 };
}

export function formatUniformLineItem(line: UniformLineItem): string {
  return `${line.quantity}x ${line.item} (${line.size})`;
}

export function formatUniformItemsSummary(items: UniformLineItem[]): string {
  return items.map(formatUniformLineItem).join(", ");
}

export function getWorkerRequestUniformItems(
  request: WorkerRequestRecord
): UniformLineItem[] {
  if (request.uniform_items.length > 0) return request.uniform_items;
  if (request.uniform_item && request.uniform_size) {
    return [
      {
        item: request.uniform_item,
        size: request.uniform_size,
        quantity: request.quantity ?? 1,
      },
    ];
  }
  return [];
}

export function formatWorkerRequestDetailLines(request: WorkerRequestRecord): string[] {
  if (request.request_type === "Uniform") {
    const items = getWorkerRequestUniformItems(request);
    if (items.length > 0) {
      return items.map(formatUniformLineItem);
    }
    return [request.description?.trim() || "—"];
  }
  const text = request.description?.trim();
  return text ? [text] : ["—"];
}

function mapWorkerRequestRow(row: Record<string, unknown>): WorkerRequestRecord {
  const createdAt = String(row.created_at ?? new Date().toISOString());
  const uniformItems = resolveUniformItemsFromRow(row);
  const firstItem = uniformItems[0];

  return {
    id: String(row.id),
    request_number: String(row.request_number ?? "REQ-0000"),
    worker_id: String(row.worker_id ?? ""),
    worker_name: String(row.worker_name ?? "Worker"),
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    request_type: normalizeRequestType(row.request_type),
    uniform_item: firstItem?.item ?? (row.uniform_item ? String(row.uniform_item) : null),
    uniform_size: firstItem?.size ?? (row.uniform_size ? String(row.uniform_size) : null),
    quantity:
      firstItem?.quantity ?? (Number(row.quantity ?? 1) || 1),
    uniform_items: uniformItems,
    description: row.description ? String(row.description) : null,
    status: normalizeRequestStatus(row.status),
    admin_comments: row.admin_comments ? String(row.admin_comments) : null,
    fulfilled_at: row.fulfilled_at ? String(row.fulfilled_at) : null,
    fulfilled_by: row.fulfilled_by ? String(row.fulfilled_by) : null,
    created_at: createdAt,
    updated_at: String(row.updated_at ?? createdAt),
  };
}

function readLocalRequests(): WorkerRequestRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => mapWorkerRequestRow(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

function writeLocalRequests(rows: WorkerRequestRecord[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify(rows));
}

function nextLocalRequestNumber(rows: WorkerRequestRecord[]): string {
  const max = rows.reduce((current, row) => {
    const match = row.request_number.match(/REQ-(\d+)/i);
    const num = match ? Number.parseInt(match[1], 10) : 0;
    return Number.isFinite(num) ? Math.max(current, num) : current;
  }, 0);
  return formatRequestCode(max + 1);
}

function sortRequestsNewestFirst(rows: WorkerRequestRecord[]): WorkerRequestRecord[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function formatWorkerRequestDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatWorkerRequestDetails(request: WorkerRequestRecord): string {
  if (request.request_type === "Uniform") {
    const lines = formatWorkerRequestDetailLines(request);
    return lines.join("\n");
  }
  return request.description?.trim() || "—";
}

export function workerRequestStatusBadgeClass(status: WorkerRequestStatus): string {
  switch (status) {
    case "In Progress":
      return "bg-blue-100 text-blue-800 ring-blue-200";
    case "Fulfilled":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    default:
      return "bg-orange-100 text-orange-800 ring-orange-200";
  }
}

export async function fetchWorkerRequestProjectOptions(
  seedProjects: DbProject[] = []
): Promise<WorkerRequestProjectOption[]> {
  const seen = new Set<string>();
  const options: WorkerRequestProjectOption[] = [];

  const addOption = (id: string, name: string) => {
    const key = id.trim() || name.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    options.push({ id: id.trim() || name.trim(), name: name.trim() || id.trim() });
  };

  for (const project of seedProjects) {
    addOption(project.id, project.name ?? getProjectDisplayName(project.id));
  }

  if (isSupabaseConfigured()) {
    try {
      const remote = await fetchProjects();
      for (const project of remote) {
        addOption(project.id, project.name ?? getProjectDisplayName(project.id));
      }
    } catch {
      // fall through to seed options
    }
  }

  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchWorkerRequests(options?: {
  projectId?: string | null;
  workerId?: string | null;
  status?: WorkerRequestStatus | "pending" | "all";
}): Promise<{ requests: WorkerRequestRecord[]; error: string | null }> {
  const projectId = options?.projectId ?? null;
  const workerId = options?.workerId ?? null;
  const status = options?.status ?? "all";

  if (!isSupabaseConfigured()) {
    let rows = readLocalRequests();
    if (projectId) {
      rows = rows.filter((row) => row.project_id === projectId);
    }
    if (workerId) {
      rows = rows.filter((row) => row.worker_id === workerId);
    }
    if (status === "pending") {
      rows = rows.filter((row) => row.status === "Pending" || row.status === "In Progress");
    } else if (status !== "all") {
      rows = rows.filter((row) => row.status === status);
    }
    return { requests: sortRequestsNewestFirst(rows), error: null };
  }

  try {
    let query = supabase.from(WORKER_REQUESTS_TABLE).select("*").order("created_at", {
      ascending: false,
    });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (workerId) {
      query = query.eq("worker_id", workerId);
    }
    if (status === "pending") {
      query = query.in("status", ["Pending", "In Progress"]);
    } else if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      return {
        requests: sortRequestsNewestFirst(readLocalRequests()),
        error: error.message,
      };
    }

    return {
      requests: (data ?? []).map((row) =>
        mapWorkerRequestRow(row as Record<string, unknown>)
      ),
      error: null,
    };
  } catch (cause) {
    return {
      requests: sortRequestsNewestFirst(readLocalRequests()),
      error: cause instanceof Error ? cause.message : "Failed to load worker requests.",
    };
  }
}

export async function fetchPendingWorkerRequests(
  options?: { projectId?: string | null }
): Promise<WorkerRequestRecord[]> {
  const result = await fetchWorkerRequests({
    projectId: options?.projectId,
    status: "pending",
  });
  return result.requests;
}

export async function countPendingWorkerRequests(
  projectId?: string | null
): Promise<number> {
  const rows = await fetchPendingWorkerRequests({ projectId });
  return rows.filter((row) => row.status === "Pending").length;
}

function buildSubmitPayload(
  input: SubmitWorkerRequestInput,
  requestNumber: string,
  now: string
): Record<string, unknown> {
  const projectName =
    input.projectName?.trim() ||
    (input.projectId ? getProjectDisplayName(input.projectId) : null) ||
    "General / Unassigned";

  if (input.requestType === "Uniform") {
    const uniformItems =
      input.uniformItems && input.uniformItems.length > 0
        ? input.uniformItems.map((row) => ({
            item: row.item.trim(),
            size: row.size.trim(),
            quantity: Math.max(1, Math.floor(row.quantity || 1)),
          }))
        : input.uniformItem?.trim() && input.uniformSize?.trim()
          ? [
              {
                item: input.uniformItem.trim(),
                size: input.uniformSize.trim(),
                quantity: Math.max(1, Math.floor(input.quantity ?? 1)),
              },
            ]
          : [];

    const firstItem = uniformItems[0];
    const summary = formatUniformItemsSummary(uniformItems);

    return stripUndefinedFields({
      request_number: requestNumber,
      worker_id: input.workerId,
      worker_name: input.workerName.trim() || "Worker",
      project_id: input.projectId || null,
      project_name: projectName,
      request_type: input.requestType,
      uniform_items: uniformItems,
      uniform_item: firstItem?.item ?? null,
      uniform_size: firstItem?.size ?? null,
      quantity: firstItem?.quantity ?? 1,
      description: summary || null,
      status: "Pending",
      created_at: now,
      updated_at: now,
    });
  }

  return stripUndefinedFields({
    request_number: requestNumber,
    worker_id: input.workerId,
    worker_name: input.workerName.trim() || "Worker",
    project_id: input.projectId || null,
    project_name: projectName,
    request_type: input.requestType,
    uniform_items: [],
    uniform_item: null,
    uniform_size: null,
    quantity: 1,
    description: input.description?.trim() || null,
    status: "Pending",
    created_at: now,
    updated_at: now,
  });
}

function validateSubmitInput(input: SubmitWorkerRequestInput): string | null {
  if (!input.workerId.trim()) return "Worker identity is required.";
  if (!input.requestType) return "Request category is required.";

  if (input.requestType === "Uniform") {
    const items =
      input.uniformItems && input.uniformItems.length > 0
        ? input.uniformItems
        : input.uniformItem?.trim() && input.uniformSize?.trim()
          ? [
              {
                item: input.uniformItem.trim(),
                size: input.uniformSize.trim(),
                quantity: input.quantity ?? 1,
              },
            ]
          : [];

    if (items.length === 0) {
      return "Add at least one uniform item.";
    }

    for (let index = 0; index < items.length; index += 1) {
      const row = items[index]!;
      if (!row.item.trim()) {
        return `Uniform item ${index + 1}: item type is required.`;
      }
      if (!row.size.trim()) {
        return `Uniform item ${index + 1}: size is required.`;
      }
    }

    return null;
  }

  if (!input.description?.trim()) {
    return "Please describe the tools or equipment required.";
  }
  return null;
}

async function insertWorkerRequestRow(
  payload: Record<string, unknown>
): Promise<{ data: WorkerRequestRecord | null; error: SupabaseRequestError | null }> {
  const { data, error } = await supabase
    .from(WORKER_REQUESTS_TABLE)
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) {
    return { data: null, error: toSupabaseRequestError(error) };
  }

  return { data: mapWorkerRequestRow(data as Record<string, unknown>), error: null };
}

export async function submitWorkerRequest(
  input: SubmitWorkerRequestInput
): Promise<{ request: WorkerRequestRecord | null; error: string | null }> {
  const validationError = validateSubmitInput(input);
  if (validationError) {
    return { request: null, error: validationError };
  }

  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const rows = readLocalRequests();
    const request: WorkerRequestRecord = mapWorkerRequestRow({
      id: `local-req-${Date.now()}`,
      ...buildSubmitPayload(input, nextLocalRequestNumber(rows), now),
    });
    writeLocalRequests([request, ...rows]);
    return { request, error: null };
  }

  try {
    const { count } = await supabase
      .from(WORKER_REQUESTS_TABLE)
      .select("*", { count: "exact", head: true });
    const requestNumber = formatRequestCode((count ?? 0) + 1);
    const payload = buildSubmitPayload(input, requestNumber, now);

    const result = await insertWorkerRequestRow(payload);
    if (result.data) {
      return { request: result.data, error: null };
    }

    if (isSupabaseSchemaOrConstraintError(result.error)) {
      const fallback = stripUndefinedFields({
        ...payload,
        request_number: formatRequestCode(Date.now() % 10000),
        uniform_items: undefined,
      });
      const retry = await insertWorkerRequestRow(fallback);
      if (retry.data) {
        return { request: retry.data, error: null };
      }
    }

    const localRows = readLocalRequests();
    const request = mapWorkerRequestRow({
      id: `local-req-${Date.now()}`,
      ...buildSubmitPayload(input, nextLocalRequestNumber(localRows), now),
    });
    writeLocalRequests([request, ...localRows]);
    return { request, error: result.error?.message ?? null };
  } catch (cause) {
    return {
      request: null,
      error: cause instanceof Error ? cause.message : "Failed to submit request.",
    };
  }
}

export async function updateWorkerRequest(
  input: UpdateWorkerRequestInput
): Promise<{ request: WorkerRequestRecord | null; error: string | null }> {
  const now = new Date().toISOString();
  const payload = stripUndefinedFields({
    status: input.status,
    admin_comments: input.adminComments?.trim() || null,
    fulfilled_by: input.fulfilledBy?.trim() || null,
    fulfilled_at: input.status === "Fulfilled" ? now : undefined,
    updated_at: now,
  });

  if (!isSupabaseConfigured()) {
    const rows = readLocalRequests();
    const index = rows.findIndex((row) => row.id === input.requestId);
    if (index < 0) {
      return { request: null, error: "Request not found." };
    }
    const current = rows[index]!;
    const updated: WorkerRequestRecord = {
      ...current,
      status: input.status ?? current.status,
      admin_comments:
        input.adminComments !== undefined ? input.adminComments : current.admin_comments,
      fulfilled_by:
        input.fulfilledBy !== undefined ? input.fulfilledBy : current.fulfilled_by,
      fulfilled_at: input.status === "Fulfilled" ? now : current.fulfilled_at,
      updated_at: now,
    };
    rows[index] = updated;
    writeLocalRequests(rows);
    return { request: updated, error: null };
  }

  try {
    const { data, error } = await supabase
      .from(WORKER_REQUESTS_TABLE)
      .update(payload)
      .eq("id", input.requestId)
      .select("*")
      .single();

    if (error) {
      return { request: null, error: error.message };
    }

    return {
      request: mapWorkerRequestRow(data as Record<string, unknown>),
      error: null,
    };
  } catch (cause) {
    return {
      request: null,
      error: cause instanceof Error ? cause.message : "Failed to update request.",
    };
  }
}

export async function markWorkerRequestFulfilled(
  requestId: string,
  fulfilledBy?: string | null,
  adminComments?: string | null
): Promise<{ request: WorkerRequestRecord | null; error: string | null }> {
  return updateWorkerRequest({
    requestId,
    status: "Fulfilled",
    fulfilledBy,
    adminComments,
  });
}

export async function markWorkerRequestInProgress(
  requestId: string,
  adminComments?: string | null
): Promise<{ request: WorkerRequestRecord | null; error: string | null }> {
  return updateWorkerRequest({
    requestId,
    status: "In Progress",
    adminComments,
  });
}

export function resolveWorkerRequestName(
  worker?: Pick<Worker, "full_name" | "name" | "first_name" | "last_name" | "worker_name"> | null,
  explicitName?: string | null
): string {
  return resolveWorkerName(worker ?? null, explicitName);
}
