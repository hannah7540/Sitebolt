import { isWorkerRevoked, supabase, isSupabaseConfigured, type Worker } from "./supabase";
import { sendEmail } from "./email-service";
import { getSiteUrl } from "./supabase/env";
import { getWorkerDisplayName } from "./worker-utils";
import {
  fetchWorkerIdsForProject,
  filterWorkersForProject,
  loadAssignmentMaps,
} from "./project-assignments";
import {
  getProjectSwmsReviewPath,
  isProjectSwmsReviewPath,
} from "./project-nav-routes";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaCacheError,
  isSupabaseTableUnavailableError,
  isSupabaseZeroRowsError,
  logSupabaseTableUnavailable,
} from "./supabase-errors";

export { getProjectSwmsReviewPath, isProjectSwmsReviewPath };

export const PROJECT_SWMS_REVIEW_SCHEDULES_TABLE = "project_swms_review_schedules";
export const PROJECT_SWMS_REVIEWS_TABLE = "project_swms_reviews";
export const DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS = 31;

export type SwmsReviewItemStatus = "accepted" | "requires_update";

export interface SwmsReviewItem {
  swms_id: string;
  title: string;
  status: SwmsReviewItemStatus;
  notes: string;
}

export interface ProjectSwmsReviewSchedule {
  id: string;
  project_id: string;
  responsible_worker_id: string;
  frequency_days: number;
  last_reviewed_at: string | null;
  next_review_due: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProjectSwmsReview {
  id: string;
  project_id: string;
  review_date: string;
  reviewing_manager_id: string;
  consulted_worker_id: string;
  reviewing_manager_signature: string;
  consulted_worker_signature: string;
  items: SwmsReviewItem[];
  created_at: string;
}

export type SwmsReviewDueKind = "good" | "due_soon" | "overdue" | "unset";

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

const SCHEDULE_COLUMNS =
  "id, project_id, responsible_worker_id, frequency_days, last_reviewed_at, next_review_due";
const REVIEW_COLUMNS =
  "id, project_id, review_date, reviewing_manager_id, consulted_worker_id, reviewing_manager_signature, consulted_worker_signature, items, created_at";
const WORKER_LOOKUP_COLUMNS = "id, first_name, last_name, full_name, email";

function isSwmsReviewSchemaError(
  error: { code?: string; message?: string } | null | undefined,
  table: string
): boolean {
  if (!error) return false;
  const requestError = {
    code: String(error.code ?? ""),
    message: String(error.message ?? ""),
    details: "",
    hint: "",
  };
  if (
    isSupabaseTableUnavailableError(requestError, table) ||
    isSupabaseSchemaCacheError(requestError) ||
    isSupabaseMissingColumnError(requestError) ||
    isSupabaseZeroRowsError(requestError)
  ) {
    return true;
  }

  const code = String(requestError.code ?? "").trim().toUpperCase();
  if (
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "PGRST200" ||
    code === "PGRST116" ||
    code === "42P01"
  ) {
    return true;
  }

  const message = `${requestError.message} ${requestError.details}`.toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("does not exist") ||
    message.includes("pgrst204") ||
    message.includes("pgrst205")
  );
}

function asSwmsReviewLogError(error: unknown, fallback: string) {
  return {
    code: "",
    message: error instanceof Error ? error.message : fallback,
    details: "",
    hint: "",
  };
}

function friendlySwmsReviewWriteError(
  error: { message?: string } | null | undefined,
  table: string,
  fallback: string
): string {
  if (isSwmsReviewSchemaError(error, table)) {
    return "SWMS review is not available yet. Try again after the review tables are applied.";
  }
  return fallback;
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function addDaysIso(from: Date, days: number): string {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + Math.max(1, Math.floor(days)));
  return next.toISOString();
}

export function resolveNextSwmsReviewDue(
  frequencyDays = DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS,
  from = new Date()
): string {
  return addDaysIso(from, frequencyDays || DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS);
}

export function classifySwmsReviewDue(nextDue: string | null | undefined): SwmsReviewDueKind {
  if (!nextDue) return "unset";
  const due = new Date(nextDue).getTime();
  if (!Number.isFinite(due)) return "unset";
  const days = (due - Date.now()) / (1000 * 60 * 60 * 24);
  if (days < 0) return "overdue";
  if (days <= 7) return "due_soon";
  return "good";
}

function parseReviewItems(value: unknown): SwmsReviewItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = asRecord(item);
      const status: SwmsReviewItemStatus =
        row.status === "requires_update" ? "requires_update" : "accepted";
      return {
        swms_id: str(row.swms_id),
        title: str(row.title) || "SWMS",
        status,
        notes: str(row.notes),
      };
    })
    .filter((item) => item.swms_id);
}

function mapSchedule(row: Record<string, unknown>): ProjectSwmsReviewSchedule {
  return {
    id: str(row.id),
    project_id: str(row.project_id),
    responsible_worker_id: str(row.responsible_worker_id),
    frequency_days: Number(row.frequency_days) || DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS,
    last_reviewed_at: row.last_reviewed_at ? String(row.last_reviewed_at) : null,
    next_review_due: String(row.next_review_due ?? ""),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapReview(row: Record<string, unknown>): ProjectSwmsReview {
  return {
    id: str(row.id),
    project_id: str(row.project_id),
    review_date: String(row.review_date ?? "").slice(0, 10),
    reviewing_manager_id: str(row.reviewing_manager_id),
    consulted_worker_id: str(row.consulted_worker_id),
    reviewing_manager_signature: str(row.reviewing_manager_signature),
    consulted_worker_signature: str(row.consulted_worker_signature),
    items: parseReviewItems(row.items),
    created_at: String(row.created_at ?? ""),
  };
}

export function tallySwmsReviewItems(items: SwmsReviewItem[]): {
  accepted: number;
  requiresUpdate: number;
} {
  return items.reduce(
    (acc, item) => {
      if (item.status === "requires_update") acc.requiresUpdate += 1;
      else acc.accepted += 1;
      return acc;
    },
    { accepted: 0, requiresUpdate: 0 }
  );
}

async function queryProjectSwmsReviewSchedule(projectId: string) {
  return supabase
    .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
    .select(SCHEDULE_COLUMNS)
    .eq("project_id", projectId)
    .maybeSingle();
}

export async function fetchProjectSwmsReviewSchedule(
  projectId: string
): Promise<{ schedule: ProjectSwmsReviewSchedule | null; error: string | null }> {
  if (!isSupabaseConfigured()) return { schedule: null, error: null };
  const trimmed = projectId.trim();
  if (!trimmed) return { schedule: null, error: null };

  try {
    let { data, error } = await queryProjectSwmsReviewSchedule(trimmed);

    // Transient PostgREST schema-cache misses: retry once, then treat as unset.
    if (error && isSwmsReviewSchemaError(error, PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)) {
      const retry = await queryProjectSwmsReviewSchedule(trimmed);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isSwmsReviewSchemaError(error, PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)) {
        logSupabaseTableUnavailable(
          "fetch schedule",
          PROJECT_SWMS_REVIEW_SCHEDULES_TABLE,
          error
        );
        return { schedule: null, error: null };
      }
      return { schedule: null, error: null };
    }

    if (!data) return { schedule: null, error: null };
    return { schedule: mapSchedule(asRecord(data)), error: null };
  } catch (error) {
    logSupabaseTableUnavailable(
      "fetch schedule",
      PROJECT_SWMS_REVIEW_SCHEDULES_TABLE,
      asSwmsReviewLogError(error, "Failed to load SWMS review schedule.")
    );
    return { schedule: null, error: null };
  }
}

/** Look up a worker by id — never via a schedule FK join / relation alias. */
export async function fetchSwmsReviewWorkerById(
  workerId: string
): Promise<(Pick<Worker, "id"> & Partial<Worker>) | null> {
  const trimmed = workerId.trim();
  if (!trimmed || !isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from("workers")
      .select(WORKER_LOOKUP_COLUMNS)
      .eq("id", trimmed)
      .maybeSingle();

    if (error || !data) return null;
    return asRecord(data) as Pick<Worker, "id"> & Partial<Worker>;
  } catch {
    return null;
  }
}

type SwmsReviewScheduleWrite = {
  project_id: string;
  responsible_worker_id: string;
  frequency_days: number;
  next_review_due: string;
  updated_at: string;
  last_reviewed_at?: string;
};

function swmsScheduleErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error ?? "Unknown SWMS schedule save error.");
}

function logSwmsScheduleSaveError(error: unknown): void {
  console.error("[SWMS Schedule Save Error]:", error);
}

/** Select-then-insert/update — never uses ON CONFLICT. */
async function writeProjectSwmsReviewSchedule(
  payload: SwmsReviewScheduleWrite
): Promise<{ schedule: ProjectSwmsReviewSchedule | null; error: string | null }> {
  const frequencyDays = payload.frequency_days || DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS;
  const updateFields: Record<string, string | number> = {
    responsible_worker_id: payload.responsible_worker_id,
    frequency_days: frequencyDays,
    next_review_due: payload.next_review_due,
    updated_at: payload.updated_at || new Date().toISOString(),
  };
  const insertFields: Record<string, string | number> = {
    project_id: payload.project_id,
    responsible_worker_id: payload.responsible_worker_id,
    frequency_days: frequencyDays,
    next_review_due: payload.next_review_due,
  };
  if (payload.last_reviewed_at) {
    updateFields.last_reviewed_at = payload.last_reviewed_at;
    insertFields.last_reviewed_at = payload.last_reviewed_at;
  }

  try {
    const { data: existing, error: checkError } = await supabase
      .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
      .select("id")
      .eq("project_id", payload.project_id)
      .maybeSingle();

    if (checkError && !isSupabaseZeroRowsError({
      code: checkError.code,
      message: checkError.message,
      details: "",
      hint: "",
    })) {
      logSwmsScheduleSaveError(checkError);
      return { schedule: null, error: checkError.message };
    }

    const existingId = str(asRecord(existing).id);

    const toSchedule = (id: string): ProjectSwmsReviewSchedule =>
      mapSchedule({
        id,
        project_id: payload.project_id,
        responsible_worker_id: payload.responsible_worker_id,
        frequency_days: frequencyDays,
        last_reviewed_at: payload.last_reviewed_at ?? null,
        next_review_due: payload.next_review_due,
        updated_at: payload.updated_at,
      });

    if (existingId) {
      const { error } = await supabase
        .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
        .update(updateFields)
        .eq("id", existingId);

      if (error) {
        const withoutUpdatedAt = { ...updateFields };
        delete withoutUpdatedAt.updated_at;
        const retry = await supabase
          .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
          .update(withoutUpdatedAt)
          .eq("id", existingId);
        if (retry.error) {
          logSwmsScheduleSaveError(error);
          return { schedule: null, error: error.message };
        }
      }

      return { schedule: toSchedule(existingId), error: null };
    }

    const { data, error } = await supabase
      .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
      .insert(insertFields)
      .select("id")
      .maybeSingle();

    if (error) {
      const again = await supabase
        .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
        .select("id")
        .eq("project_id", payload.project_id)
        .maybeSingle();
      const againId = str(asRecord(again.data).id);
      if (againId) {
        const updated = await supabase
          .from(PROJECT_SWMS_REVIEW_SCHEDULES_TABLE)
          .update(updateFields)
          .eq("id", againId);
        if (updated.error) {
          logSwmsScheduleSaveError(updated.error);
          return { schedule: null, error: updated.error.message };
        }
        return { schedule: toSchedule(againId), error: null };
      }
      logSwmsScheduleSaveError(error);
      return { schedule: null, error: error.message };
    }

    const insertedId = str(asRecord(data).id);
    if (!insertedId) {
      const message = "Schedule write returned no row.";
      logSwmsScheduleSaveError(message);
      return { schedule: null, error: message };
    }
    return { schedule: toSchedule(insertedId), error: null };
  } catch (error) {
    logSwmsScheduleSaveError(error);
    return { schedule: null, error: swmsScheduleErrorMessage(error) };
  }
}

export async function upsertProjectSwmsReviewSchedule(input: {
  projectId: string;
  responsibleWorkerId: string;
  frequencyDays?: number;
}): Promise<{ schedule: ProjectSwmsReviewSchedule | null; error: string | null }> {
  if (!isSupabaseConfigured()) return { schedule: null, error: "Supabase is not configured." };

  const projectId = input.projectId.trim();
  const responsibleWorkerId = input.responsibleWorkerId.trim();
  const frequencyDays = Math.max(
    1,
    Math.floor(input.frequencyDays ?? DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS)
  );
  if (!projectId) return { schedule: null, error: "Project is required." };
  if (!responsibleWorkerId) return { schedule: null, error: "Select a responsible worker." };

  const existing = await fetchProjectSwmsReviewSchedule(projectId);
  const now = new Date();
  const nextDue = existing.schedule?.last_reviewed_at
    ? resolveNextSwmsReviewDue(frequencyDays, new Date(existing.schedule.last_reviewed_at))
    : resolveNextSwmsReviewDue(frequencyDays, now);

  return writeProjectSwmsReviewSchedule({
    project_id: projectId,
    responsible_worker_id: responsibleWorkerId,
    frequency_days: frequencyDays,
    next_review_due: existing.schedule?.last_reviewed_at
      ? nextDue
      : existing.schedule?.next_review_due &&
          new Date(existing.schedule.next_review_due).getTime() > now.getTime()
        ? existing.schedule.next_review_due
        : nextDue,
    updated_at: now.toISOString(),
  });
}

export async function fetchProjectSwmsReviews(
  projectId: string
): Promise<{ reviews: ProjectSwmsReview[]; error: string | null }> {
  if (!isSupabaseConfigured()) return { reviews: [], error: null };
  const trimmed = projectId.trim();
  if (!trimmed) return { reviews: [], error: null };

  try {
    let { data, error } = await supabase
      .from(PROJECT_SWMS_REVIEWS_TABLE)
      .select(REVIEW_COLUMNS)
      .eq("project_id", trimmed)
      .order("review_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error && isSwmsReviewSchemaError(error, PROJECT_SWMS_REVIEWS_TABLE)) {
      const retry = await supabase
        .from(PROJECT_SWMS_REVIEWS_TABLE)
        .select(REVIEW_COLUMNS)
        .eq("project_id", trimmed)
        .order("review_date", { ascending: false })
        .order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isSwmsReviewSchemaError(error, PROJECT_SWMS_REVIEWS_TABLE)) {
        logSupabaseTableUnavailable("fetch reviews", PROJECT_SWMS_REVIEWS_TABLE, error);
      }
      return { reviews: [], error: null };
    }
    return { reviews: (data ?? []).map((row) => mapReview(asRecord(row))), error: null };
  } catch (error) {
    logSupabaseTableUnavailable(
      "fetch reviews",
      PROJECT_SWMS_REVIEWS_TABLE,
      asSwmsReviewLogError(error, "Failed to load SWMS reviews.")
    );
    return { reviews: [], error: null };
  }
}

export async function submitProjectSwmsReview(input: {
  projectId: string;
  reviewDate?: string;
  reviewingManagerId: string;
  consultedWorkerId: string;
  reviewingManagerSignature: string;
  consultedWorkerSignature: string;
  items: SwmsReviewItem[];
  frequencyDays?: number;
}): Promise<{ review: ProjectSwmsReview | null; error: string | null }> {
  if (!isSupabaseConfigured()) return { review: null, error: "Supabase is not configured." };

  const projectId = input.projectId.trim();
  const reviewingManagerId = input.reviewingManagerId.trim();
  const consultedWorkerId = input.consultedWorkerId.trim();
  const managerSig = input.reviewingManagerSignature.trim();
  const workerSig = input.consultedWorkerSignature.trim();
  const items = input.items.filter((item) => item.swms_id && item.status);

  if (!projectId) return { review: null, error: "Project is required." };
  if (!reviewingManagerId) return { review: null, error: "Reviewing manager is required." };
  if (!consultedWorkerId) return { review: null, error: "Select a consulted site worker." };
  if (consultedWorkerId === reviewingManagerId) {
    return { review: null, error: "Consulted worker must be a different project worker." };
  }
  if (!managerSig) return { review: null, error: "Reviewing manager signature is required." };
  if (!workerSig) return { review: null, error: "Consulted worker signature is required." };
  if (items.length === 0) return { review: null, error: "Review at least one active SWMS." };
  if (items.some((item) => item.status === "requires_update" && !item.notes.trim())) {
    return { review: null, error: "Add required modifications for each SWMS marked for update." };
  }

  const reviewDate = (input.reviewDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const now = new Date();

  try {
    const { data, error } = await supabase
      .from(PROJECT_SWMS_REVIEWS_TABLE)
      .insert({
        project_id: projectId,
        review_date: reviewDate,
        reviewing_manager_id: reviewingManagerId,
        consulted_worker_id: consultedWorkerId,
        reviewing_manager_signature: managerSig,
        consulted_worker_signature: workerSig,
        items,
      })
      .select(REVIEW_COLUMNS)
      .maybeSingle();

    if (error) {
      return {
        review: null,
        error: friendlySwmsReviewWriteError(
          error,
          PROJECT_SWMS_REVIEWS_TABLE,
          "Failed to save SWMS review."
        ),
      };
    }

    const schedule = await fetchProjectSwmsReviewSchedule(projectId);
    const frequencyDays =
      input.frequencyDays ||
      schedule.schedule?.frequency_days ||
      DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS;
    const schedulePayload = {
      project_id: projectId,
      responsible_worker_id: schedule.schedule?.responsible_worker_id || reviewingManagerId,
      frequency_days: frequencyDays,
      last_reviewed_at: now.toISOString(),
      next_review_due: resolveNextSwmsReviewDue(frequencyDays, now),
      updated_at: now.toISOString(),
    };

    try {
      const written = await writeProjectSwmsReviewSchedule(schedulePayload);
      if (written.error) {
        logSupabaseTableUnavailable(
          "update schedule after review",
          PROJECT_SWMS_REVIEW_SCHEDULES_TABLE,
          asSwmsReviewLogError(written.error, written.error)
        );
      }
    } catch (scheduleError) {
      logSupabaseTableUnavailable(
        "update schedule after review",
        PROJECT_SWMS_REVIEW_SCHEDULES_TABLE,
        asSwmsReviewLogError(scheduleError, "Failed to update SWMS review schedule.")
      );
    }

    return { review: data ? mapReview(asRecord(data)) : null, error: null };
  } catch (error) {
    return {
      review: null,
      error: friendlySwmsReviewWriteError(
        error instanceof Error ? error : null,
        PROJECT_SWMS_REVIEWS_TABLE,
        "Failed to save SWMS review."
      ),
    };
  }
}

export function workerNameFromList(workers: Worker[], workerId: string): string {
  const match = workers.find((worker) => worker.id === workerId);
  return match ? getWorkerDisplayName(match) : "Unknown worker";
}

/** Workers inducted/assigned to this project only — never the full org roster. */
export async function fetchProjectScopedWorkers(
  projectId: string,
  allWorkers: Worker[]
): Promise<Worker[]> {
  const trimmed = projectId.trim();
  if (!trimmed) return [];

  try {
    const [{ workerByProject }, junctionWorkerIds] = await Promise.all([
      loadAssignmentMaps(),
      fetchWorkerIdsForProject(trimmed),
    ]);

    const fromFilter = filterWorkersForProject(allWorkers, trimmed, workerByProject);
    const byId = new Map(allWorkers.map((worker) => [worker.id, worker]));
    const merged = new Map<string, Worker>();

    for (const worker of fromFilter) {
      if (!worker.is_subcontractor && !isWorkerRevoked(worker)) {
        merged.set(worker.id, worker);
      }
    }
    for (const workerId of junctionWorkerIds) {
      const worker = byId.get(workerId);
      if (worker && !worker.is_subcontractor && !isWorkerRevoked(worker)) {
        merged.set(worker.id, worker);
      }
    }

    return [...merged.values()].sort((a, b) =>
      getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b))
    );
  } catch {
    return [];
  }
}

export function formatSwmsReviewDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Email the project's designated responsible worker that the SWMS review is due.
 * Deep-links to /projects/[id]/swms/review.
 */
export async function sendSwmsReviewReminder(
  projectId: string,
  options?: { projectName?: string | null }
): Promise<{ sent: boolean; error: string | null }> {
  const trimmed = projectId.trim();
  if (!trimmed) return { sent: false, error: "Project is required." };
  if (!isSupabaseConfigured()) return { sent: false, error: "Supabase is not configured." };

  const { schedule, error: scheduleError } = await fetchProjectSwmsReviewSchedule(trimmed);
  if (scheduleError) return { sent: false, error: scheduleError };
  if (!schedule?.responsible_worker_id) {
    return { sent: false, error: "Assign a responsible worker before sending a reminder." };
  }

  const worker = await fetchSwmsReviewWorkerById(schedule.responsible_worker_id);
  const email = str(worker?.email).toLowerCase();
  if (!email || !email.includes("@")) {
    return { sent: false, error: "Responsible worker does not have a valid email address." };
  }

  const projectName = options?.projectName?.trim() || "this project";
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const deepLink = `${siteUrl}${getProjectSwmsReviewPath(trimmed)}`;
  const workerName = worker
    ? getWorkerDisplayName({
        first_name: str(asRecord(worker).first_name) || null,
        last_name: str(asRecord(worker).last_name) || null,
        full_name: str(asRecord(worker).full_name) || null,
      } as Worker)
    : "there";

  const result = await sendEmail({
    to: [email],
    subject: `SWMS periodic review due: ${projectName}`,
    text: [
      `Hi ${workerName},`,
      "",
      `The SWMS periodic review is due for ${projectName}.`,
      "Complete the dual sign-off review with a consulted site worker.",
      "",
      `Open the review: ${deepLink}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <h2 style="margin:0 0 12px">SWMS periodic review due</h2>
        <p style="margin:0 0 16px">
          Hi ${escapeHtml(workerName)}, the SWMS periodic review is due for
          <strong>${escapeHtml(projectName)}</strong>.
        </p>
        <p style="margin:0 0 16px">
          Complete the review with a consulted site worker and record both signatures.
        </p>
        <p style="margin:0 0 24px">
          <a href="${deepLink}" style="display:inline-block;background:#f97316;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
            Open SWMS Review
          </a>
        </p>
        <p style="margin:0;font-size:12px;color:#64748b">${escapeHtml(deepLink)}</p>
      </div>
    `,
  });

  if (result.sent) return { sent: true, error: null };
  return { sent: false, error: result.error ?? "Failed to send SWMS review reminder." };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
