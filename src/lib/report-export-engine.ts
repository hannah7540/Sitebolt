import { fetchProjectItps } from "./itp-service";
import { fetchProjectItcs } from "./itc-service";
import { fetchOrganizationFleet } from "./organization-fleet";
import {
  fetchAllWorkerVocs,
  fetchAllWorkers,
  fetchPlantList,
  fetchPlantPrestarts,
  fetchSiteForms,
  fetchSwmsAssignmentRecords,
  isWorkerDeleted,
  resolvePlantAssignedProjectId,
  resolveWorkerAssignedProjectName,
  type PlantAsset,
  type Worker,
} from "./supabase";
import { fetchAssets } from "./assets";
import { fetchLeaveRequestsNormalized } from "./leave-requests";
import { fetchRfis, formatRfiDate } from "./rfi-service";
import { fetchSwmsDocuments } from "./swms";
import {
  buildCompetencyMatrixCsv,
  buildCompetencyMatrix,
} from "./competency-matrix";
import {
  buildInductionsReportCsv,
  fetchAllInductionAssignments,
} from "./admin-reporting";
import type { DbProject } from "./project-resolver";
import { getWorkerDisplayName } from "./worker-utils";
import {
  enrichItemsWithWorkerNames,
  fetchWorkerProfileNameMap,
} from "./worker-profile-lookup";
import type { ReportModuleId } from "./generated-reports-service";
import { buildTimesheetHoursReportSection } from "./timesheet-hours-report";
import {
  normalizeWorkerStateRegion,
  type WorkerStateRegion,
} from "./worker-state-region";
import { fetchCustomFormSubmissions } from "./custom-forms";

export interface ReportExportInput {
  startDate: string;
  endDate: string;
  projectIds: string[];
  modules: ReportModuleId[];
  projects: DbProject[];
  stateFilters?: WorkerStateRegion[];
}

export interface ReportExportResult {
  fileName: string;
  csvContent: string;
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toDay(value: string): number {
  const date = new Date(value.slice(0, 10));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isWithinRange(
  iso: string | null | undefined,
  startDate: string,
  endDate: string
): boolean {
  if (!iso) return false;
  const day = toDay(iso.slice(0, 10));
  return day >= toDay(startDate) && day <= toDay(endDate);
}

function leaveOverlapsRange(
  firstDate: string,
  lastDate: string,
  startDate: string,
  endDate: string
): boolean {
  return (
    toDay(firstDate) <= toDay(endDate) && toDay(lastDate) >= toDay(startDate)
  );
}

function allProjectsSelected(
  projectIds: string[],
  projects: DbProject[]
): boolean {
  return projectIds.length === 0 || projectIds.length >= projects.length;
}

function matchesProjectFilter(
  projectId: string | null | undefined,
  projectIds: string[],
  projects: DbProject[]
): boolean {
  if (allProjectsSelected(projectIds, projects)) return true;
  if (!projectId) return false;
  return projectIds.includes(projectId);
}

function matchesStateFilter(
  recordState: string | null | undefined,
  stateFilters?: WorkerStateRegion[]
): boolean {
  if (!stateFilters || stateFilters.length === 0) return true;
  const normalized = normalizeWorkerStateRegion(recordState);
  return normalized != null && stateFilters.includes(normalized);
}

function projectState(
  projectId: string | null | undefined,
  projects: DbProject[]
): string | null {
  if (!projectId) return null;
  return projects.find((project) => project.id === projectId)?.state ?? null;
}

function workerMatchesReportFilters(
  worker: Worker,
  input: ReportExportInput
): boolean {
  const projectIds = [
    worker.assigned_project_id,
    ...(worker.assigned_project_ids ?? []),
    worker.project_id,
  ].filter((value): value is string => Boolean(value));

  const matchesProject =
    allProjectsSelected(input.projectIds, input.projects) ||
    projectIds.some((projectId) => input.projectIds.includes(projectId));
  if (!matchesProject) return false;

  if (!input.stateFilters || input.stateFilters.length === 0) return true;
  if (matchesStateFilter(worker.state, input.stateFilters)) return true;
  return projectIds.some((projectId) =>
    matchesStateFilter(projectState(projectId, input.projects), input.stateFilters)
  );
}

const FINANCIAL_KEY_PATTERN =
  /(^|_)(bank|bsb|tfn|tax|super|usi|pay|rate|salary|wage|account_number|redundancy)(_|$)/i;

function isFinancialWorkerKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    FINANCIAL_KEY_PATTERN.test(normalized) ||
    normalized.includes("bank") ||
    normalized.includes("bsb") ||
    normalized.includes("tfn") ||
    normalized.includes("tax") ||
    normalized.includes("super") ||
    normalized.includes("usi") ||
    normalized.includes("salary") ||
    normalized.includes("wage") ||
    normalized.includes("account_number") ||
    normalized.includes("hourly_rate") ||
    normalized.includes("pay_rate") ||
    normalized.includes("pay_rule") ||
    normalized.includes("redundancy") ||
    /(^|_)rate(_|$)/.test(normalized)
  );
}

function sanitizeWorkerForReport(worker: Worker): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(worker)) {
    if (isFinancialWorkerKey(key)) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function resolveProjectLabel(
  projectId: string | null | undefined,
  projects: DbProject[]
): string {
  if (!projectId) return "";
  const project = projects.find((row) => row.id === projectId);
  return project?.name || project?.project_name || "";
}

function sectionCsv(title: string, headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const body = rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  return [`### ${title}`, headerLine, body].filter(Boolean).join("\n");
}

function buildFileName(): string {
  return `SiteBolt_Report_${new Date().toISOString().slice(0, 10)}.csv`;
}

async function buildItpsItcsSection(
  input: ReportExportInput
): Promise<string> {
  const targetProjects = (
    allProjectsSelected(input.projectIds, input.projects)
      ? input.projects
      : input.projects.filter((project) => input.projectIds.includes(project.id))
  ).filter((project) => matchesStateFilter(project.state, input.stateFilters));

  const itpRows: string[][] = [];
  const itcRows: string[][] = [];

  for (const project of targetProjects) {
    const [itps, itcs] = await Promise.all([
      fetchProjectItps(project.id),
      fetchProjectItcs(project.id),
    ]);

    for (const itp of itps) {
      const stamp = itp.updated_at ?? itp.created_at ?? "";
      if (stamp && !isWithinRange(stamp, input.startDate, input.endDate)) continue;
      itpRows.push([
        project.project_name ?? "",
        itp.itp_number,
        itp.title,
        itp.trade_category,
        itp.status,
        itp.subcontractor_name ?? "",
        itp.location_area ?? "",
        itp.revision,
        stamp.slice(0, 10),
      ]);
    }

    for (const itc of itcs) {
      const stamp = itc.updated_at ?? itc.created_at ?? "";
      if (stamp && !isWithinRange(stamp, input.startDate, input.endDate)) continue;
      itcRows.push([
        project.project_name ?? "",
        itc.itc_number,
        itc.zone_code ?? "",
        itc.service_discipline,
        itc.status,
        String(itc.progress_percent),
        itc.assigned_name ?? "",
        itc.start_location ?? "",
        itc.end_location ?? "",
        stamp.slice(0, 10),
      ]);
    }
  }

  return [
    sectionCsv("ITPs", [
      "Project",
      "ITP Number",
      "Title",
      "Trade",
      "Status",
      "Subcontractor",
      "Location",
      "Revision",
      "Updated",
    ], itpRows),
    sectionCsv("ITCs", [
      "Project",
      "ITC Number",
      "Zone",
      "Discipline",
      "Status",
      "Progress %",
      "Assigned To",
      "Start",
      "End",
      "Updated",
    ], itcRows),
  ].join("\n\n");
}

async function buildFleetSection(input: ReportExportInput): Promise<string> {
  const fleet = await fetchOrganizationFleet();
  const rows = fleet
    .filter((vehicle) => {
      const projectId =
        vehicle.assigned_project_id ??
        input.projects.find(
          (project) =>
            project.name === vehicle.assigned_project_name ||
            project.project_name === vehicle.assigned_project_name
        )?.id ??
        null;
      return (
        matchesProjectFilter(projectId, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(projectId, input.projects), input.stateFilters)
      );
    })
    .map((vehicle) => [
    vehicle.unit_number,
    vehicle.registration ?? "",
    vehicle.rego_expiry_date ?? "",
    String(vehicle.current_hours),
    vehicle.assigned_project_name ?? "",
    vehicle.assigned_worker_name ?? "",
    vehicle.status,
  ]);

  return sectionCsv(
    "Fleet",
    [
      "Unit #",
      "Registration",
      "Rego Expiry",
      "Current Hours",
      "Assigned Project",
      "Assigned Worker",
      "Status",
    ],
    rows
  );
}

async function buildPlantSection(input: ReportExportInput): Promise<string> {
  const [plant, prestarts] = await Promise.all([
    fetchPlantList(),
    fetchPlantPrestarts({
      startDate: input.startDate,
      endDate: input.endDate,
      limit: 2000,
    }),
  ]);

  const lastPrestartByPlant = new Map<string, string>();
  for (const prestart of prestarts) {
    const plantId = String(prestart.plant_id ?? "");
    const stamp = prestart.created_at ?? "";
    if (!plantId || !stamp) continue;
    const existing = lastPrestartByPlant.get(plantId);
    if (!existing || stamp > existing) {
      lastPrestartByPlant.set(plantId, stamp.slice(0, 10));
    }
  }

  const plantRows = plant
    .filter((item) => {
      const assignedProjectId = resolvePlantAssignedProjectId(item);
      return (
        matchesProjectFilter(assignedProjectId, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(assignedProjectId, input.projects), input.stateFilters)
      );
    })
    .map((item: PlantAsset) => [
      item.unit_number,
      String(item.current_hours ?? ""),
      String(item.next_service_hours ?? ""),
      lastPrestartByPlant.get(item.id) ?? "",
      resolveProjectLabel(resolvePlantAssignedProjectId(item), input.projects),
      String(item.status ?? ""),
    ]);

  const assets = await fetchAssets();
  const assetRows = assets
    .filter(
      (asset) =>
        matchesProjectFilter(asset.assigned_project_id, input.projectIds, input.projects) &&
        matchesStateFilter(
          projectState(asset.assigned_project_id, input.projects),
          input.stateFilters
        )
    )
    .map((asset) => [
      asset.asset_number,
      asset.name,
      asset.status,
      asset.next_service_due_date ?? "",
      asset.next_calibration_due_date ?? "",
      resolveProjectLabel(asset.assigned_project_id, input.projects),
    ]);

  return [
    sectionCsv(
      "Plant",
      [
        "Unit #",
        "Current Hours",
        "Next Service Due Hours",
        "Last Pre-Start Date",
        "Project",
        "Status",
      ],
      plantRows
    ),
    sectionCsv(
      "Equipment",
      [
        "Asset #",
        "Name",
        "Status",
        "Next Service Due",
        "Next Calibration Due",
        "Project",
      ],
      assetRows
    ),
  ].join("\n\n");
}

function computeOutstandingProfileItems(worker: Worker): string {
  const items: string[] = [];
  if (!worker.white_card_number) items.push("Missing White Card");
  if (!worker.induction_completed_at) items.push("Induction incomplete");
  if (worker.drivers_licence_expiry) {
    const expiry = toDay(worker.drivers_licence_expiry);
    if (expiry < toDay(new Date().toISOString())) {
      items.push("Expired Driver Licence");
    }
  }
  return items.join("; ");
}

async function buildWorkersSection(input: ReportExportInput): Promise<string> {
  const { workers } = await fetchAllWorkers();
  const assignments = await fetchSwmsAssignmentRecords();
  const unsignedByWorker = new Map<string, number>();

  for (const assignment of assignments) {
    if (String(assignment.status ?? "").toLowerCase() !== "signed") {
      const workerId = String(assignment.assignee_id ?? "");
      if (!workerId) continue;
      unsignedByWorker.set(workerId, (unsignedByWorker.get(workerId) ?? 0) + 1);
    }
  }

  const rows = workers
    .filter((worker) => !isWorkerDeleted(worker) && !worker.is_archived && !worker.is_revoked)
    .filter((worker) => workerMatchesReportFilters(worker, input))
    .map((worker) => {
      const safe = sanitizeWorkerForReport(worker);
      return [
        getWorkerDisplayName(worker),
        String(safe.email ?? ""),
        String(safe.phone ?? ""),
        String(safe.trade ?? safe.worker_type ?? ""),
        String(safe.state ?? ""),
        resolveWorkerAssignedProjectName(worker),
        (worker.assigned_project_ids ?? [])
          .map((projectId) => resolveProjectLabel(projectId, input.projects))
          .filter(Boolean)
          .join("; "),
        String(safe.status ?? ""),
        computeOutstandingProfileItems(worker),
        String(unsignedByWorker.get(worker.id) ?? 0),
      ];
    });

  return sectionCsv(
    "Workers",
    [
      "Worker Name",
      "Email",
      "Phone",
      "Role",
      "State",
      "Primary Project",
      "Assigned Projects",
      "Status",
      "Outstanding Profile Items",
      "Unsigned SWMS Count",
    ],
    rows
  );
}

async function buildCompetenciesSection(
  input: ReportExportInput
): Promise<string> {
  const [{ workers }, vocs] = await Promise.all([
    fetchAllWorkers(),
    fetchAllWorkerVocs(),
  ]);

  const filteredWorkers = workers.filter((worker) =>
    workerMatchesReportFilters(worker, input)
  );

  const matrixRows = buildCompetencyMatrix(filteredWorkers, vocs);
  return `### Competencies\n${buildCompetencyMatrixCsv(matrixRows)}`;
}

async function buildInductionsSection(input: ReportExportInput): Promise<string> {
  const assignments = await fetchAllInductionAssignments();
  const filtered = assignments.filter((row) => {
    const stamp = row.completed_at ?? row.assigned_at;
    if (!isWithinRange(stamp, input.startDate, input.endDate)) return false;
    return (
      matchesProjectFilter(row.project_id, input.projectIds, input.projects) &&
      matchesStateFilter(projectState(row.project_id, input.projects), input.stateFilters)
    );
  });

  const workerIds = [...new Set(filtered.map((row) => row.worker_id).filter(Boolean))];
  const profileMap = await fetchWorkerProfileNameMap(workerIds);
  const enriched = enrichItemsWithWorkerNames(filtered, profileMap);

  return `### Inductions\n${buildInductionsReportCsv(enriched)}`;
}

async function buildLeaveRequestsSection(
  input: ReportExportInput
): Promise<string> {
  const requests = await fetchLeaveRequestsNormalized({ status: "pending" });
  const workerIds = [...new Set(requests.map((request) => request.worker_id))];
  const profileMap = await fetchWorkerProfileNameMap(workerIds);

  const rows = requests
    .filter((request) =>
      leaveOverlapsRange(
        request.first_date,
        request.last_date,
        input.startDate,
        input.endDate
      )
    )
    .filter(
      (request) =>
        matchesProjectFilter(request.project_id, input.projectIds, input.projects) &&
        matchesStateFilter(
          projectState(request.project_id, input.projects),
          input.stateFilters
        )
    )
    .map((request) => [
      request.worker_name?.trim() ||
        profileMap.get(request.worker_id) ||
        request.worker_id,
      request.first_date,
      request.last_date,
      String(request.number_of_days),
      request.leave_type ?? "",
      request.status,
      request.reason,
    ]);

  return sectionCsv(
    "Leave Requests",
    [
      "Worker",
      "First Date",
      "Last Date",
      "Days",
      "Leave Type",
      "Status",
      "Reason",
    ],
    rows
  );
}

async function buildAssetsSection(input: ReportExportInput): Promise<string> {
  const assets = await fetchAssets();
  const rows = assets
    .filter(
      (asset) =>
        matchesProjectFilter(asset.assigned_project_id, input.projectIds, input.projects) &&
        matchesStateFilter(
          projectState(asset.assigned_project_id, input.projects),
          input.stateFilters
        )
    )
    .map((asset) => [
      asset.asset_number,
      asset.name,
      asset.status,
      asset.next_service_due_date ?? "",
      asset.next_calibration_due_date ?? "",
      asset.assigned_project_id
        ? input.projects.find((project) => project.id === asset.assigned_project_id)
            ?.project_name ?? asset.assigned_project_id
        : "",
    ]);

  return sectionCsv(
    "Assets",
    [
      "Asset #",
      "Name",
      "Status",
      "Next Service Due",
      "Next Calibration Due",
      "Project",
    ],
    rows
  );
}

async function buildSiteFormSection(
  input: ReportExportInput,
  formType: "safety_walk" | "toolbox_talk",
  title: string
): Promise<string> {
  const forms = await fetchSiteForms({ formType, limit: 2000 });
  const filtered = forms
    .filter((form) =>
      isWithinRange(form.submitted_at ?? form.form_date, input.startDate, input.endDate)
    )
    .filter(
      (form) =>
        matchesProjectFilter(form.project_id, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(form.project_id, input.projects), input.stateFilters)
    );

  const workerIds = [
    ...new Set(filtered.map((form) => form.worker_id).filter(Boolean) as string[]),
  ];
  const profileMap = await fetchWorkerProfileNameMap(workerIds);

  const rows = filtered.map((form) => [
      form.form_date,
      form.submitted_at ?? "",
      input.projects.find((project) => project.id === form.project_id)?.project_name ??
        form.project_id,
      profileMap.get(form.worker_id) ?? form.worker_id,
      String(form.attendees?.length ?? 0),
      form.form_data?.toolbox_subject
        ? String(form.form_data.toolbox_subject)
        : "",
    ]);

  return sectionCsv(
    title,
    ["Form Date", "Submitted At", "Project", "Submitted By", "Attendees", "Topic"],
    rows
  );
}

async function buildRfisSection(input: ReportExportInput): Promise<string> {
  const { rfis } = await fetchRfis({ filter: "all" });
  const rows = rfis
    .filter((row) => isWithinRange(row.created_at, input.startDate, input.endDate))
    .filter(
      (row) =>
        matchesProjectFilter(row.project_id, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(row.project_id, input.projects), input.stateFilters)
    )
    .map((row) => [
      row.rfi_number,
      formatRfiDate(row.date_raised ?? row.created_at),
      row.zone_area ?? "",
      row.category ?? "",
      row.discipline ?? "",
      row.subject || row.title,
      row.raised_by,
      row.assigned_to_name ?? "",
      row.priority,
      row.status,
      row.due_date ?? "",
      row.response_resolution ?? "",
      row.action_required ?? "",
      row.close_out_date ?? "",
      row.closed_by ?? "",
      String(row.attachments.length + (row.document_url ? 1 : 0)),
      row.comments ?? "",
    ]);

  return sectionCsv(
    "RFIs",
    [
      "RFI Number",
      "Date Raised",
      "Zone / Area",
      "Category",
      "Discipline",
      "Subject",
      "Raised By",
      "Assigned To",
      "Priority",
      "Status",
      "Due Date",
      "Response / Resolution",
      "Action Required",
      "Close-Out Date",
      "Closed By",
      "Attachments",
      "Comments",
    ],
    rows
  );
}

async function buildFormsCompletedSection(
  input: ReportExportInput
): Promise<string> {
  const [siteForms, customResult] = await Promise.all([
    fetchSiteForms({
      startDate: input.startDate,
      endDate: input.endDate,
      limit: 2000,
    }),
    fetchCustomFormSubmissions({}),
  ]);

  const siteRows = siteForms
    .filter((form) =>
      isWithinRange(form.submitted_at ?? form.form_date, input.startDate, input.endDate)
    )
    .filter(
      (form) =>
        matchesProjectFilter(form.project_id, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(form.project_id, input.projects), input.stateFilters)
    )
    .map((form) => [
      form.form_type,
      form.form_date,
      form.submitted_at ?? "",
      resolveProjectLabel(form.project_id, input.projects),
      form.worker_id,
      String(form.attendees?.length ?? 0),
      form.status ?? "Completed",
    ]);

  const customRows = (customResult.data ?? [])
    .filter((form) => isWithinRange(form.submitted_at, input.startDate, input.endDate))
    .filter(
      (form) =>
        matchesProjectFilter(form.project_id, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(form.project_id, input.projects), input.stateFilters)
    )
    .map((form) => [
      form.template_title || "Custom Form",
      form.submitted_at.slice(0, 10),
      form.submitted_at,
      resolveProjectLabel(form.project_id, input.projects),
      form.submitted_by_name ?? form.worker_id ?? "",
      "",
      "Completed",
    ]);

  return [
    sectionCsv(
      "Forms Completed — Site Forms",
      ["Form Type", "Form Date", "Submitted At", "Project", "Submitted By", "Attendees", "Status"],
      siteRows
    ),
    sectionCsv(
      "Forms Completed — Custom Forms",
      ["Form Type", "Form Date", "Submitted At", "Project", "Submitted By", "Attendees", "Status"],
      customRows
    ),
  ].join("\n\n");
}

async function buildSwmsSection(input: ReportExportInput): Promise<string> {
  const documents = await fetchSwmsDocuments();
  const rows = documents
    .filter((doc) => {
      const stamp = doc.document_date ?? doc.created_at ?? "";
      if (stamp && !isWithinRange(stamp, input.startDate, input.endDate)) return false;
      return (
        matchesProjectFilter(doc.project_id ?? null, input.projectIds, input.projects) &&
        matchesStateFilter(projectState(doc.project_id, input.projects), input.stateFilters)
      );
    })
    .map((doc) => [
      doc.title,
      doc.project_id
        ? input.projects.find((project) => project.id === doc.project_id)?.project_name ??
          doc.project_id
        : "Company",
      String(doc.totalAssigned ?? 0),
      String(doc.signedCount ?? 0),
      String(doc.pendingCount ?? 0),
      doc.document_date ?? "",
      doc.status ?? "",
    ]);

  return sectionCsv(
    "SWMS",
    [
      "Title",
      "Project",
      "Assigned Workers",
      "Signed",
      "Unsigned",
      "Document Date",
      "Status",
    ],
    rows
  );
}

const MODULE_BUILDERS: Record<
  ReportModuleId,
  (input: ReportExportInput) => Promise<string>
> = {
  itps_itcs: buildItpsItcsSection,
  fleet: buildFleetSection,
  plant: buildPlantSection,
  workers: buildWorkersSection,
  competencies: buildCompetenciesSection,
  inductions: buildInductionsSection,
  forms_completed: buildFormsCompletedSection,
  leave_requests: buildLeaveRequestsSection,
  assets: buildAssetsSection,
  safety_walks: (input) => buildSiteFormSection(input, "safety_walk", "Safety Walks"),
  toolbox_talks: (input) =>
    buildSiteFormSection(input, "toolbox_talk", "Toolbox Talks"),
  rfis: buildRfisSection,
  swms: buildSwmsSection,
  timesheets_hours: buildTimesheetHoursReportSection,
};

export async function generateReportExport(
  input: ReportExportInput
): Promise<ReportExportResult> {
  if (input.modules.length === 0) {
    throw new Error("Select at least one report module.");
  }

  const sections: string[] = [];
  for (const moduleId of input.modules) {
    const builder = MODULE_BUILDERS[moduleId];
    try {
      sections.push(await builder(input));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load this entity.";
      sections.push(
        sectionCsv(moduleId, ["Status"], [[`Skipped: ${message}`]])
      );
    }
  }

  const projectLabel = allProjectsSelected(input.projectIds, input.projects)
    ? "All Projects"
    : input.projectIds
        .map((projectId) => resolveProjectLabel(projectId, input.projects) || projectId)
        .join(", ");
  const stateLabel =
    !input.stateFilters || input.stateFilters.length === 0
      ? "All States"
      : input.stateFilters.join(", ");

  const csvContent = stripFinancialCsvColumns(
    [
      `# SiteBolt Report Export`,
      `# Date Range: ${input.startDate} to ${input.endDate}`,
      `# Projects: ${projectLabel}`,
      `# States: ${stateLabel}`,
      "",
      sections.join("\n\n"),
    ].join("\n")
  );

  return {
    fileName: buildFileName(),
    csvContent,
  };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function stripFinancialCsvColumns(csv: string): string {
  const output: string[] = [];
  let dropIndexes: Set<number> | null = null;

  for (const rawLine of csv.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith("#")) {
      dropIndexes = rawLine.startsWith("### ") ? null : dropIndexes;
      output.push(rawLine);
      continue;
    }

    const cells = parseCsvLine(rawLine);
    if (dropIndexes == null) {
      dropIndexes = new Set(
        cells
          .map((header, index) =>
            isFinancialWorkerKey(header.replace(/\s+/g, "_")) ? index : -1
          )
          .filter((index) => index >= 0)
      );
    }

    output.push(
      cells
        .filter((_, index) => !dropIndexes?.has(index))
        .map(escapeCsvValue)
        .join(",")
    );
  }

  return output.join("\n");
}