import { supabase, isSupabaseConfigured } from "./supabase";

export const GENERATED_REPORTS_TABLE = "generated_reports";

export type ReportModuleId =
  | "itps_itcs"
  | "fleet"
  | "plant"
  | "workers"
  | "competencies"
  | "inductions"
  | "leave_requests"
  | "assets"
  | "safety_walks"
  | "toolbox_talks"
  | "rfis"
  | "swms"
  | "timesheets_hours";

export const REPORT_MODULE_OPTIONS: {
  id: ReportModuleId;
  label: string;
}[] = [
  { id: "itps_itcs", label: "ITPs & ITCs (Full submission data)" },
  { id: "fleet", label: "Fleet (Unit #, Rego expiry, current hours)" },
  {
    id: "plant",
    label:
      "Plant (Unit #, current hours, next service due hours, last pre-start date)",
  },
  {
    id: "workers",
    label:
      "Workers (Worker name, current project/s, outstanding profile items/unsigned SWMS)",
  },
  {
    id: "competencies",
    label:
      "Competencies (Matrix layout: Worker name, current project, competencies + expiry dates)",
  },
  { id: "inductions", label: "Inductions (Assigned vs Completed status list)" },
  { id: "leave_requests", label: "Leave Requests (Pending/unapproved leave requests)" },
  {
    id: "assets",
    label:
      "Assets (Current status, last service/calibration date, next due service/calibration date)",
  },
  { id: "safety_walks", label: "Safety Walks (Completed safety walks in date range)" },
  {
    id: "toolbox_talks",
    label: "Toolbox Talks (Completed toolbox talks in date range)",
  },
  { id: "rfis", label: "RFIs (RFI register list and status breakdown)" },
  {
    id: "swms",
    label: "SWMS (List of SWMS + signed vs unsigned worker tracking)",
  },
  {
    id: "timesheets_hours",
    label: "Timesheets & Daily Hours (Attendance and hours only — no pay data)",
  },
];

export type ReportExportFormat = "pdf" | "excel";

export interface GeneratedReportRecord {
  id: string;
  created_at: string;
  actioned_by_id: string | null;
  actioned_by_name: string;
  start_date: string;
  end_date: string;
  selected_modules: ReportModuleId[];
  project_ids: string[];
  project_names: string[];
  file_name: string;
  csv_content: string;
  export_format: ReportExportFormat;
}

export interface SaveGeneratedReportInput {
  actioned_by_id?: string | null;
  actioned_by_name: string;
  start_date: string;
  end_date: string;
  selected_modules: ReportModuleId[];
  project_ids: string[];
  project_names: string[];
  file_name: string;
  csv_content: string;
  export_format: ReportExportFormat;
}

const LOCAL_GENERATED_REPORTS_KEY = "sitebolt_generated_reports_local";

function normalizeModules(raw: unknown): ReportModuleId[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set(REPORT_MODULE_OPTIONS.map((option) => option.id));
  return raw
    .map((value) => String(value))
    .filter((value): value is ReportModuleId => valid.has(value as ReportModuleId));
}

function normalizeExportFormat(raw: unknown): ReportExportFormat {
  return raw === "pdf" ? "pdf" : "excel";
}

function normalizeReportRow(row: Record<string, unknown>): GeneratedReportRecord {
  return {
    id: String(row.id ?? crypto.randomUUID()),
    created_at: String(row.created_at ?? new Date().toISOString()),
    actioned_by_id: row.actioned_by_id ? String(row.actioned_by_id) : null,
    actioned_by_name: String(row.actioned_by_name ?? "Admin"),
    start_date: String(row.start_date ?? "").slice(0, 10),
    end_date: String(row.end_date ?? "").slice(0, 10),
    selected_modules: normalizeModules(row.selected_modules),
    project_ids: Array.isArray(row.project_ids)
      ? row.project_ids.map(String)
      : [],
    project_names: Array.isArray(row.project_names)
      ? row.project_names.map(String)
      : [],
    file_name: String(row.file_name ?? "sitebolt-report.csv"),
    csv_content: String(row.csv_content ?? ""),
    export_format: normalizeExportFormat(row.export_format),
  };
}

function readLocalReports(): GeneratedReportRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_GENERATED_REPORTS_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Record<string, unknown>[]).map(normalizeReportRow);
  } catch {
    return [];
  }
}

function writeLocalReports(rows: GeneratedReportRecord[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_GENERATED_REPORTS_KEY, JSON.stringify(rows));
}

export function formatReportModules(modules: ReportModuleId[]): string {
  if (modules.length === 0) return "—";
  return modules
    .map(
      (moduleId) =>
        REPORT_MODULE_OPTIONS.find((option) => option.id === moduleId)?.label ??
        moduleId
    )
    .join(", ");
}

export function formatReportProjects(projectNames: string[]): string {
  if (projectNames.length === 0) return "All Projects";
  return projectNames.join(", ");
}

export function formatReportDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function fetchGeneratedReports(): Promise<{
  reports: GeneratedReportRecord[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      reports: readLocalReports().sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      ),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from(GENERATED_REPORTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return {
      reports: readLocalReports(),
      error: error.message,
    };
  }

  return {
    reports: (data ?? []).map((row) =>
      normalizeReportRow(row as Record<string, unknown>)
    ),
    error: null,
  };
}

export async function saveGeneratedReport(
  input: SaveGeneratedReportInput
): Promise<{ report: GeneratedReportRecord | null; error: string | null }> {
  const payload = {
    actioned_by_id: input.actioned_by_id ?? null,
    actioned_by_name: input.actioned_by_name,
    start_date: input.start_date,
    end_date: input.end_date,
    selected_modules: input.selected_modules,
    project_ids: input.project_ids,
    project_names: input.project_names,
    file_name: input.file_name,
    csv_content: input.csv_content,
    export_format: input.export_format,
  };

  if (!isSupabaseConfigured()) {
    const report = normalizeReportRow({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...payload,
    });
    const next = [report, ...readLocalReports()];
    writeLocalReports(next);
    return { report, error: null };
  }

  const { data, error } = await supabase
    .from(GENERATED_REPORTS_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    const report = normalizeReportRow({
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      ...payload,
    });
    writeLocalReports([report, ...readLocalReports()]);
    return { report, error: error.message };
  }

  return {
    report: normalizeReportRow(data as Record<string, unknown>),
    error: null,
  };
}

export function buildReportExcelFileName(startDate: string, endDate: string): string {
  return `sitebolt-report-${startDate}-to-${endDate}.csv`;
}

export function buildReportPdfFileName(startDate: string, endDate: string): string {
  return `sitebolt-report-${startDate}-to-${endDate}.pdf`;
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadGeneratedReportExcel(report: GeneratedReportRecord): void {
  const fileName = report.file_name.endsWith(".csv")
    ? report.file_name
    : buildReportExcelFileName(report.start_date, report.end_date);
  const blob = new Blob([report.csv_content], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(fileName, blob);
}

export async function downloadGeneratedReportPdf(
  report: GeneratedReportRecord
): Promise<void> {
  const { generateReportPdfFromCsv, downloadReportBlob } = await import(
    "./pdf/report-pdf"
  );
  const { fileName, blob } = await generateReportPdfFromCsv({
    csvContent: report.csv_content,
    startDate: report.start_date,
    endDate: report.end_date,
    projectNames: report.project_names,
    modules: report.selected_modules,
    actionedByName: report.actioned_by_name,
  });
  downloadReportBlob(fileName, blob);
}

/** @deprecated Use downloadGeneratedReportExcel */
export function downloadGeneratedReportCsv(report: GeneratedReportRecord): void {
  downloadGeneratedReportExcel(report);
}
