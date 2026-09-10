import {
  fetchPlantPrestarts,
  fetchSiteForms,
  type PlantAsset,
  type PlantPrestart,
  type Worker,
} from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import {
  fetchCompletedInductionAssignments,
  type FormWorkerAssignment,
} from "@/lib/induction-form-builder";
import {
  getPlantPrestartUnitLabel,
  getSiteFormSubmitterName,
  hasSafetyWalkOpenHazards,
  isSafetyWalkHazardActionResolved,
  isSiteFormViewed,
} from "@/lib/dashboard-form-utils";
import {
  getPlantPrestartStatusLabel,
  getPrestartDefectNotes,
} from "@/lib/plant-prestart-utils";
import { getWorkerDisplayName } from "@/lib/worker-utils";

export const PAST_SUBMISSIONS_PAGE_SIZE = 50;

export type PastSubmissionWidgetType =
  | "plant_prestarts"
  | "defects"
  | "safety_walks"
  | "daily_prestarts"
  | "inductions";

export type PastSubmissionStatusTone = "neutral" | "success" | "warning" | "danger";

export type PastSubmissionRecord =
  | {
      kind: "plant";
      id: string;
      occurredAt: string;
      prestart: PlantPrestart;
    }
  | {
      kind: "site_form";
      id: string;
      occurredAt: string;
      form: SiteFormSubmission;
    }
  | {
      kind: "induction";
      id: string;
      occurredAt: string;
      assignment: FormWorkerAssignment;
    };

export interface PastSubmissionListItem {
  id: string;
  occurredAt: string;
  submitterName: string;
  title: string;
  subtitle?: string;
  statusLabel: string;
  statusTone: PastSubmissionStatusTone;
  searchText: string;
  record: PastSubmissionRecord;
}

export const PAST_SUBMISSION_TITLES: Record<PastSubmissionWidgetType, string> = {
  plant_prestarts: "Past Plant Pre-Starts",
  defects: "Past Plant Defects",
  safety_walks: "Past Safety Walks",
  daily_prestarts: "Past Site Daily Logs",
  inductions: "Past Inductions",
};

export function isHistoricalPlantDefect(prestart: PlantPrestart): boolean {
  if (prestart.has_defect) return true;
  if (prestart.defect_ignored) return true;
  if (prestart.defect_reviewed) return true;
  if (prestart.defect_status?.trim()) return true;
  if (prestart.cleared_at) return true;
  return getPrestartDefectNotes(prestart).length > 0;
}

function plantOccurredAt(prestart: PlantPrestart): string {
  return prestart.submitted_at ?? prestart.created_at;
}

function siteFormOccurredAt(form: SiteFormSubmission): string {
  return form.submitted_at || form.created_at || form.form_date;
}

function inductionOccurredAt(assignment: FormWorkerAssignment): string {
  return assignment.completed_at || assignment.assigned_at;
}

function resolvePlantOperatorName(prestart: PlantPrestart, workers: Worker[]): string {
  if (prestart.operator_name?.trim()) return prestart.operator_name.trim();
  if (prestart.operator_worker_id) {
    const worker = workers.find((row) => row.id === prestart.operator_worker_id);
    if (worker) return getWorkerDisplayName(worker);
  }
  return "Unknown operator";
}

export function plantPrestartHistoryStatus(prestart: PlantPrestart): {
  label: string;
  tone: PastSubmissionStatusTone;
} {
  if (prestart.defect_ignored) {
    return { label: "Ignored", tone: "warning" };
  }
  const defectStatus = (prestart.defect_status ?? "").trim().toLowerCase();
  if (defectStatus === "resolved" || prestart.cleared_at) {
    return { label: "Resolved", tone: "success" };
  }
  if (prestart.is_read || prestart.defect_reviewed) {
    return { label: "Read", tone: "neutral" };
  }
  const label = getPlantPrestartStatusLabel(prestart);
  if (label === "Passed") return { label: "Completed", tone: "success" };
  if (label === "Failed") return { label: "Failed", tone: "danger" };
  return { label: "Defect", tone: "warning" };
}

export function siteFormHistoryStatus(form: SiteFormSubmission): {
  label: string;
  tone: PastSubmissionStatusTone;
} {
  if (form.form_type === "safety_walk") {
    if (hasSafetyWalkOpenHazards(form)) {
      return { label: "Follow-up", tone: "warning" };
    }
    if (isSafetyWalkHazardActionResolved(form)) {
      return { label: "Resolved", tone: "success" };
    }
  }
  const workflow = form.status?.trim().toLowerCase();
  if (workflow === "resolved" || workflow === "closed") {
    return { label: "Resolved", tone: "success" };
  }
  if (isSiteFormViewed(form)) {
    return { label: "Read", tone: "neutral" };
  }
  return { label: "Completed", tone: "success" };
}

export function toPastSubmissionListItem(
  record: PastSubmissionRecord,
  workers: Worker[],
  plant: PlantAsset[]
): PastSubmissionListItem {
  if (record.kind === "plant") {
    const operator = resolvePlantOperatorName(record.prestart, workers);
    const unit = getPlantPrestartUnitLabel(record.prestart, plant);
    const status = plantPrestartHistoryStatus(record.prestart);
    const notes = getPrestartDefectNotes(record.prestart);
    return {
      id: record.id,
      occurredAt: record.occurredAt,
      submitterName: operator,
      title: unit,
      subtitle: operator,
      statusLabel: status.label,
      statusTone: status.tone,
      searchText: [unit, operator, notes, record.prestart.defect_summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      record,
    };
  }

  if (record.kind === "site_form") {
    const submitter = getSiteFormSubmitterName(record.form, workers);
    const status = siteFormHistoryStatus(record.form);
    const keywordParts = [
      submitter,
      record.form.title,
      record.form.notes,
      record.form.location_scope,
      record.form.form_type,
      ...Object.values(record.form.form_data ?? {}).map((value) => String(value ?? "")),
    ];
    return {
      id: record.id,
      occurredAt: record.occurredAt,
      submitterName: submitter,
      title: record.form.title?.trim() || submitter,
      subtitle: record.form.location_scope ?? undefined,
      statusLabel: status.label,
      statusTone: status.tone,
      searchText: keywordParts.join(" ").toLowerCase(),
      record,
    };
  }

    const matchedWorker = workers.find((row) => row.id === record.assignment.worker_id);
    const worker =
      record.assignment.worker_name?.trim() ||
      (matchedWorker ? getWorkerDisplayName(matchedWorker) : "Unknown worker");
  const title = record.assignment.form_title?.trim() || "Induction";
  return {
    id: record.id,
    occurredAt: record.occurredAt,
    submitterName: worker,
    title,
    subtitle: record.assignment.project_name ?? undefined,
    statusLabel: "Completed",
    statusTone: "success",
    searchText: [
      worker,
      title,
      record.assignment.project_name,
      JSON.stringify(record.assignment.responses ?? {}),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    record,
  };
}

export async function fetchPastSubmissionsPage(input: {
  widgetType: PastSubmissionWidgetType;
  projectId?: string | null;
  offset: number;
  startDate?: string;
  endDate?: string;
}): Promise<{
  records: PastSubmissionRecord[];
  hasMore: boolean;
  error: string | null;
}> {
  const projectId = input.projectId?.trim() || undefined;
  const fetchLimit = PAST_SUBMISSIONS_PAGE_SIZE + 1;
  const startDate = input.startDate?.trim() || undefined;
  const endDate = input.endDate?.trim() || undefined;

  try {
    if (input.widgetType === "inductions") {
      const result = await fetchCompletedInductionAssignments({
        projectId,
        offset: input.offset,
        limit: PAST_SUBMISSIONS_PAGE_SIZE,
        startDate,
        endDate,
      });
      return {
        records: result.assignments.map((assignment) => ({
          kind: "induction" as const,
          id: assignment.id,
          occurredAt: inductionOccurredAt(assignment),
          assignment,
        })),
        hasMore: result.hasMore,
        error: result.error,
      };
    }

    if (input.widgetType === "plant_prestarts" || input.widgetType === "defects") {
      const rows = await fetchPlantPrestarts({
        projectId,
        offset: input.offset,
        limit: fetchLimit,
        startDate,
        endDate,
      });
      const hasMore = rows.length > PAST_SUBMISSIONS_PAGE_SIZE;
      const pageRows = rows.slice(0, PAST_SUBMISSIONS_PAGE_SIZE);
      const filtered =
        input.widgetType === "defects"
          ? pageRows.filter(isHistoricalPlantDefect)
          : pageRows;
      return {
        records: filtered.map((prestart) => ({
          kind: "plant" as const,
          id: prestart.id,
          occurredAt: plantOccurredAt(prestart),
          prestart,
        })),
        hasMore,
        error: null,
      };
    }

    const formType =
      input.widgetType === "safety_walks" ? "safety_walk" : "daily_prestart";
    const rows = await fetchSiteForms({
      projectId,
      formType,
      offset: input.offset,
      limit: fetchLimit,
      startDate,
      endDate,
    });
    const page = rows.slice(0, PAST_SUBMISSIONS_PAGE_SIZE);
    return {
      records: page.map((form) => ({
        kind: "site_form" as const,
        id: form.id,
        occurredAt: siteFormOccurredAt(form),
        form,
      })),
      hasMore: rows.length > PAST_SUBMISSIONS_PAGE_SIZE,
      error: null,
    };
  } catch (error) {
    console.error("fetchPastSubmissionsPage failed:", error);
    return {
      records: [],
      hasMore: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not load past submissions. Please try again.",
    };
  }
}

export function matchesPastSubmissionSearch(
  item: PastSubmissionListItem,
  query: string
): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return item.searchText.includes(trimmed);
}

export function formatPastSubmissionTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
