import {
  fetchFormTemplateAssignments,
  fetchInductionForms,
  isCompletedAssignmentStatus,
  type FormWorkerAssignment,
} from "./induction-form-builder";
import { fetchRfis, type RfiRecord } from "./rfi-service";
import {
  fetchAllWorkerVocs,
  fetchAllWorkers,
  fetchSiteForms,
  type Worker,
  type WorkerVoc,
} from "./supabase";
import type { SiteFormSubmission } from "./site-forms";
import {
  buildCompetencyMatrix,
  isActiveMatrixWorker,
  type CompetencyMatrixRow,
} from "./competency-matrix";
import { hydrateCardsVocsFromWorker, cardCategoryRequiresExpiry } from "./worker-cards-vocs";
import { daysUntil, getTicketStatus } from "./worker-utils";
import {
  enrichItemsWithWorkerNames,
  fetchWorkerProfileNameMap,
} from "./worker-profile-lookup";

export interface AdminReportingMetrics {
  induction: {
    total: number;
    completed: number;
    pending: number;
    completionRate: number;
  };
  rfi: {
    total: number;
    open: number;
    completed: number;
  };
  competency: {
    activeWorkers: number;
    workersWithValidTickets: number;
    coverageRate: number;
  };
  safety: {
    total: number;
    dailyPrestarts: number;
    toolboxTalks: number;
    safetyWalks: number;
  };
  formCompletionTrends: FormCompletionTrendPoint[];
  rfiTurnaround: {
    averageDays: number | null;
    completedCount: number;
  };
  expiryMatrix: ExpiryMatrixCounts;
}

export interface FormCompletionTrendPoint {
  monthKey: string;
  monthLabel: string;
  inductions: number;
  safetyForms: number;
}

export interface ExpiryMatrixCounts {
  within30Days: number;
  within60Days: number;
  expired: number;
}

export interface AdminReportingSnapshot {
  workers: Worker[];
  vocs: WorkerVoc[];
  assignments: FormWorkerAssignment[];
  rfis: RfiRecord[];
  siteForms: SiteFormSubmission[];
  matrixRows: CompetencyMatrixRow[];
  metrics: AdminReportingMetrics;
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function monthKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function buildRecentMonthKeys(count = 6): string[] {
  const keys: string[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let index = 0; index < count; index += 1) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, "0");
    keys.unshift(`${year}-${month}`);
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return keys;
}

export async function fetchAllInductionAssignments(): Promise<FormWorkerAssignment[]> {
  const { forms } = await fetchInductionForms();
  const results = await Promise.all(
    forms.map((form) => fetchFormTemplateAssignments(form.id))
  );
  return results.flatMap((result) => result.assignments);
}

function countExpiryMatrix(workers: Worker[], vocs: WorkerVoc[]): ExpiryMatrixCounts {
  const vocsByWorker = new Map<string, WorkerVoc[]>();
  for (const voc of vocs) {
    const bucket = vocsByWorker.get(voc.worker_id) ?? [];
    bucket.push(voc);
    vocsByWorker.set(voc.worker_id, bucket);
  }

  const counts: ExpiryMatrixCounts = {
    within30Days: 0,
    within60Days: 0,
    expired: 0,
  };

  for (const worker of workers.filter(isActiveMatrixWorker)) {
    const entries = hydrateCardsVocsFromWorker(
      worker,
      vocsByWorker.get(worker.id) ?? []
    );

    for (const entry of entries) {
      if (!entry.expiry_date) continue;
      const remaining = daysUntil(entry.expiry_date);
      if (remaining === null) continue;
      if (remaining < 0) counts.expired += 1;
      else if (remaining <= 30) counts.within30Days += 1;
      else if (remaining <= 60) counts.within60Days += 1;
    }
  }

  return counts;
}

function computeCompetencyCoverage(
  workers: Worker[],
  vocs: WorkerVoc[]
): AdminReportingMetrics["competency"] {
  const vocsByWorker = new Map<string, WorkerVoc[]>();
  for (const voc of vocs) {
    const bucket = vocsByWorker.get(voc.worker_id) ?? [];
    bucket.push(voc);
    vocsByWorker.set(voc.worker_id, bucket);
  }

  const activeWorkers = workers.filter(isActiveMatrixWorker);
  let workersWithValidTickets = 0;

  for (const worker of activeWorkers) {
    const entries = hydrateCardsVocsFromWorker(
      worker,
      vocsByWorker.get(worker.id) ?? []
    );

    const hasValidTicket = entries.some((entry) => {
      const hasRecord = Boolean(
        entry.ticket_number ||
          entry.issue_date ||
          entry.expiry_date ||
          entry.document_url
      );
      if (!hasRecord) return false;
      if (!cardCategoryRequiresExpiry(entry.category) || !entry.expiry_date) return true;
      const status = getTicketStatus(entry.expiry_date);
      return status === "valid" || status === "expires_soon";
    });

    if (hasValidTicket) workersWithValidTickets += 1;
  }

  const activeWorkerCount = activeWorkers.length;
  return {
    activeWorkers: activeWorkerCount,
    workersWithValidTickets,
    coverageRate:
      activeWorkerCount > 0
        ? Math.round((workersWithValidTickets / activeWorkerCount) * 100)
        : 0,
  };
}

function computeFormCompletionTrends(
  assignments: FormWorkerAssignment[],
  siteForms: SiteFormSubmission[]
): FormCompletionTrendPoint[] {
  const monthKeys = buildRecentMonthKeys(6);
  const inductionCounts = new Map<string, number>();
  const safetyCounts = new Map<string, number>();

  for (const key of monthKeys) {
    inductionCounts.set(key, 0);
    safetyCounts.set(key, 0);
  }

  for (const assignment of assignments) {
    if (!isCompletedAssignmentStatus(assignment.status)) continue;
    const key = monthKeyFromIso(assignment.completed_at ?? assignment.assigned_at);
    if (!key || !inductionCounts.has(key)) continue;
    inductionCounts.set(key, (inductionCounts.get(key) ?? 0) + 1);
  }

  for (const form of siteForms) {
    const key = monthKeyFromIso(form.submitted_at ?? form.form_date);
    if (!key || !safetyCounts.has(key)) continue;
    safetyCounts.set(key, (safetyCounts.get(key) ?? 0) + 1);
  }

  return monthKeys.map((monthKey) => ({
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    inductions: inductionCounts.get(monthKey) ?? 0,
    safetyForms: safetyCounts.get(monthKey) ?? 0,
  }));
}

function computeRfiTurnaround(rfis: RfiRecord[]): AdminReportingMetrics["rfiTurnaround"] {
  const completed = rfis.filter(
    (row) =>
      (row.status === "Closed" || row.status === "Resolved") &&
      row.completed_at &&
      row.created_at
  );

  if (completed.length === 0) {
    return { averageDays: null, completedCount: 0 };
  }

  const totalDays = completed.reduce((sum, row) => {
    const start = new Date(row.created_at).getTime();
    const end = new Date(row.completed_at!).getTime();
    const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    return sum + days;
  }, 0);

  return {
    averageDays: Math.round((totalDays / completed.length) * 10) / 10,
    completedCount: completed.length,
  };
}

export function buildAdminReportingMetrics(input: {
  workers: Worker[];
  vocs: WorkerVoc[];
  assignments: FormWorkerAssignment[];
  rfis: RfiRecord[];
  siteForms: SiteFormSubmission[];
}): AdminReportingMetrics {
  const completedAssignments = input.assignments.filter((row) =>
    isCompletedAssignmentStatus(row.status)
  ).length;
  const totalAssignments = input.assignments.length;

  const openRfis = input.rfis.filter(
    (row) => row.status === "Open" || row.status === "Pending"
  ).length;
  const completedRfis = input.rfis.filter(
    (row) => row.status === "Resolved" || row.status === "Closed"
  ).length;

  const dailyPrestarts = input.siteForms.filter(
    (row) => row.form_type === "daily_prestart"
  ).length;
  const toolboxTalks = input.siteForms.filter(
    (row) => row.form_type === "toolbox_talk"
  ).length;
  const safetyWalks = input.siteForms.filter(
    (row) => row.form_type === "safety_walk"
  ).length;

  return {
    induction: {
      total: totalAssignments,
      completed: completedAssignments,
      pending: totalAssignments - completedAssignments,
      completionRate:
        totalAssignments > 0
          ? Math.round((completedAssignments / totalAssignments) * 100)
          : 0,
    },
    rfi: {
      total: input.rfis.length,
      open: openRfis,
      completed: completedRfis,
    },
    competency: computeCompetencyCoverage(input.workers, input.vocs),
    safety: {
      total: input.siteForms.length,
      dailyPrestarts,
      toolboxTalks,
      safetyWalks,
    },
    formCompletionTrends: computeFormCompletionTrends(
      input.assignments,
      input.siteForms
    ),
    rfiTurnaround: computeRfiTurnaround(input.rfis),
    expiryMatrix: countExpiryMatrix(input.workers, input.vocs),
  };
}

export async function loadAdminReportingSnapshot(): Promise<AdminReportingSnapshot> {
  const [
    workersResult,
    vocs,
    assignmentsRaw,
    rfisResult,
    siteForms,
  ] = await Promise.all([
    fetchAllWorkers(),
    fetchAllWorkerVocs(),
    fetchAllInductionAssignments(),
    fetchRfis({ filter: "all" }),
    fetchSiteForms({ limit: 1000 }),
  ]);

  const workers = workersResult.workers;
  const rfis = rfisResult.rfis;

  const workerIds = [
    ...new Set(assignmentsRaw.map((row) => row.worker_id).filter(Boolean)),
  ];
  const profileMap = await fetchWorkerProfileNameMap(workerIds);
  const assignments = enrichItemsWithWorkerNames(assignmentsRaw, profileMap);
  const matrixRows = buildCompetencyMatrix(workers, vocs);
  const metrics = buildAdminReportingMetrics({
    workers,
    vocs,
    assignments,
    rfis,
    siteForms,
  });

  return {
    workers,
    vocs,
    assignments,
    rfis,
    siteForms,
    matrixRows,
    metrics,
  };
}

export function buildInductionsReportCsv(
  assignments: FormWorkerAssignment[]
): string {
  const headers = [
    "Worker Name",
    "Form Title",
    "Status",
    "Assigned At",
    "Completed At",
    "Project",
  ];

  const lines = assignments.map((row) =>
    [
      row.worker_name ?? "",
      row.form_title ?? "",
      row.status,
      row.assigned_at,
      row.completed_at ?? "",
      row.project_name ?? "",
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [headers.map(escapeCsvValue).join(","), ...lines].join("\n");
}

export function buildRfiSummaryCsv(rfis: RfiRecord[]): string {
  const headers = [
    "RFI Number",
    "Title",
    "Status",
    "Priority",
    "Zone / Area",
    "Category",
    "Discipline",
    "Project",
    "Requested By",
    "Assigned To",
    "Due Date",
    "Created At",
    "Completed At",
    "Response / Resolution",
    "Turnaround Days",
  ];

  const lines = rfis.map((row) => {
    const turnaround =
      row.completed_at && row.created_at
        ? Math.max(
            0,
            Math.round(
              (new Date(row.completed_at).getTime() -
                new Date(row.created_at).getTime()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : "";

    return [
      row.rfi_number,
      row.title,
      row.status,
      row.priority,
      row.zone_area ?? "",
      row.category ?? "",
      row.discipline ?? "",
      row.project_name ?? "",
      row.raised_by,
      row.assigned_to_name ?? "",
      row.due_date ?? "",
      row.created_at,
      row.completed_at ?? "",
      row.response_resolution ?? "",
      turnaround,
    ]
      .map(escapeCsvValue)
      .join(",");
  });

  return [headers.map(escapeCsvValue).join(","), ...lines].join("\n");
}

export function buildComplianceExpiryReportCsv(
  workers: Worker[],
  vocs: WorkerVoc[]
): string {
  const vocsByWorker = new Map<string, WorkerVoc[]>();
  for (const voc of vocs) {
    const bucket = vocsByWorker.get(voc.worker_id) ?? [];
    bucket.push(voc);
    vocsByWorker.set(voc.worker_id, bucket);
  }

  const headers = [
    "Worker Name",
    "Competency",
    "Expiry Date",
    "Days Remaining",
    "Status",
  ];

  const lines: string[] = [];

  for (const worker of workers.filter(isActiveMatrixWorker)) {
    const entries = hydrateCardsVocsFromWorker(
      worker,
      vocsByWorker.get(worker.id) ?? []
    );

    for (const entry of entries) {
      if (!entry.expiry_date) continue;
      const remaining = daysUntil(entry.expiry_date);
      if (remaining === null) continue;

      let status = "Valid";
      if (remaining < 0) status = "Expired";
      else if (remaining <= 30) status = "Expiring within 30 days";
      else if (remaining <= 60) status = "Expiring within 60 days";

      lines.push(
        [
          worker.full_name,
          entry.ticket_name,
          entry.expiry_date.slice(0, 10),
          remaining,
          status,
        ]
          .map(escapeCsvValue)
          .join(",")
      );
    }
  }

  return [headers.map(escapeCsvValue).join(","), ...lines].join("\n");
}

export function downloadInductionsReportCsv(assignments: FormWorkerAssignment[]): void {
  downloadCsv(buildInductionsReportCsv(assignments), "sitebolt-inductions-report.csv");
}

export function downloadRfiSummaryCsv(rfis: RfiRecord[]): void {
  downloadCsv(buildRfiSummaryCsv(rfis), "sitebolt-rfi-summary.csv");
}

export function downloadComplianceExpiryReportCsv(
  workers: Worker[],
  vocs: WorkerVoc[]
): void {
  downloadCsv(
    buildComplianceExpiryReportCsv(workers, vocs),
    "sitebolt-compliance-expiry-report.csv"
  );
}
