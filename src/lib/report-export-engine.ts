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
import type { WorkerStateRegion } from "./worker-state-region";

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

function sectionCsv(title: string, headers: string[], rows: string[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const body = rows
    .map((row) => row.map(escapeCsvValue).join(","))
    .join("\n");
  return [`### ${title}`, headerLine, body].filter(Boolean).join("\n");
}

function buildFileName(startDate: string, endDate: string): string {
  return `sitebolt-report-${startDate}-to-${endDate}.csv`;
}

async function buildItpsItcsSection(
  input: ReportExportInput
): Promise<string> {
  const targetProjects = allProjectsSelected(input.projectIds, input.projects)
    ? input.projects
    : input.projects.filter((project) => input.projectIds.includes(project.id));

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

async function buildFleetSection(): Promise<string> {
  const fleet = await fetchOrganizationFleet();
  const rows = fleet.map((vehicle) => [
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

  const rows = plant
    .filter((item) =>
      matchesProjectFilter(
        resolvePlantAssignedProjectId(item),
        input.projectIds,
        input.projects
      )
    )
    .map((item: PlantAsset) => [
      item.unit_number,
      String(item.current_hours ?? ""),
      String(item.next_service_hours ?? ""),
      lastPrestartByPlant.get(item.id) ?? "",
      resolvePlantAssignedProjectId(item)
        ? input.projects.find(
            (project) => project.id === resolvePlantAssignedProjectId(item)
          )?.project_name ?? ""
        : "",
      String(item.status ?? ""),
    ]);

  return sectionCsv(
    "Plant",
    [
      "Unit #",
      "Current Hours",
      "Next Service Due Hours",
      "Last Pre-Start Date",
      "Project",
      "Status",
    ],
    rows
  );
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
    .filter((worker) => !worker.is_archived && !worker.is_revoked)
    .filter((worker) => {
      const projectIds = [
        worker.assigned_project_id,
        ...(worker.assigned_project_ids ?? []),
        worker.project_id,
      ].filter(Boolean) as string[];
      if (allProjectsSelected(input.projectIds, input.projects)) return true;
      return projectIds.some((projectId) => input.projectIds.includes(projectId));
    })
    .map((worker) => [
      getWorkerDisplayName(worker),
      resolveWorkerAssignedProjectName(worker),
      (worker.assigned_project_ids ?? [])
        .map(
          (projectId) =>
            input.projects.find((project) => project.id === projectId)
              ?.project_name ?? projectId
        )
        .join("; "),
      String(worker.status ?? ""),
      computeOutstandingProfileItems(worker),
      String(unsignedByWorker.get(worker.id) ?? 0),
    ]);

  return sectionCsv(
    "Workers",
    [
      "Worker Name",
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

  const filteredWorkers = workers.filter((worker) => {
    const projectIds = [
      worker.assigned_project_id,
      ...(worker.assigned_project_ids ?? []),
      worker.project_id,
    ].filter(Boolean) as string[];
    if (allProjectsSelected(input.projectIds, input.projects)) return true;
    return projectIds.some((projectId) => input.projectIds.includes(projectId));
  });

  const matrixRows = buildCompetencyMatrix(filteredWorkers, vocs);
  return `### Competencies\n${buildCompetencyMatrixCsv(matrixRows)}`;
}

async function buildInductionsSection(input: ReportExportInput): Promise<string> {
  const assignments = await fetchAllInductionAssignments();
  const filtered = assignments.filter((row) => {
    const stamp = row.completed_at ?? row.assigned_at;
    if (!isWithinRange(stamp, input.startDate, input.endDate)) return false;
    return matchesProjectFilter(row.project_id, input.projectIds, input.projects);
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
    .filter((request) =>
      matchesProjectFilter(request.project_id, input.projectIds, input.projects)
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
    .filter((asset) =>
      matchesProjectFilter(asset.assigned_project_id, input.projectIds, input.projects)
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
    .filter((form) =>
      matchesProjectFilter(form.project_id, input.projectIds, input.projects)
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
    .filter((row) =>
      matchesProjectFilter(row.project_id, input.projectIds, input.projects)
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

async function buildSwmsSection(input: ReportExportInput): Promise<string> {
  const documents = await fetchSwmsDocuments();
  const rows = documents
    .filter((doc) => {
      const stamp = doc.document_date ?? doc.created_at ?? "";
      if (stamp && !isWithinRange(stamp, input.startDate, input.endDate)) return false;
      return matchesProjectFilter(doc.project_id ?? null, input.projectIds, input.projects);
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
    sections.push(await builder(input));
  }

  const csvContent = [
    `# SiteBolt Report Export`,
    `# Date Range: ${input.startDate} to ${input.endDate}`,
    `# Projects: ${
      allProjectsSelected(input.projectIds, input.projects)
        ? "All Projects"
        : input.projectIds.join(", ")
    }`,
    "",
    sections.join("\n\n"),
  ].join("\n");

  return {
    fileName: buildFileName(input.startDate, input.endDate),
    csvContent,
  };
}