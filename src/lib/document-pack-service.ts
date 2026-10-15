import { supabase, isSupabaseConfigured, fetchPlantPrestarts, type PlantAsset } from "./supabase";
import { loadCompanyProfile, type CompanyProfileRecord } from "./company-profile-service";
import { fetchItpById, type ProjectItp } from "./itp-service";
import { fetchItcDetail, type ItcDetailBundle } from "./itc-service";
import { fetchPlantMaintenance } from "./plant-maintenance";
import { getLatestPrestartByPlant } from "./plant-prestart-utils";
import { ITP_ITEM_STATUS_LABELS, ITP_POINT_TYPE_LABELS, ITP_STATUS_LABELS } from "./itp-templates";
import {
  buildSwmsWorkerSignOffMatrix,
  fetchSwmsDocumentsForPack,
  formatSwmsVersionLabel,
  getSwmsAssigneeName,
  getSwmsDocumentDate,
  resolveSwmsScope,
  type SwmsDocumentSummary,
} from "./swms";
import {
  filterWorkersForProject,
  getPlantAssignedProjectIds,
  loadAssignmentMaps,
} from "./project-assignments";
import { getWorkerDisplayName } from "./worker-utils";
import {
  hydratePlantDocumentsFromLegacy,
  PLANT_DOCUMENT_CATEGORY_LABELS,
  type PlantDocumentRecord,
} from "./plant-documents";
import type { Worker } from "./supabase";
import { PROJECT_ITCS_TABLE, PROJECT_ITPS_TABLE } from "./itp-itc-payload";

export type DocumentPackSection = "itps" | "swms" | "plant";
export type DocumentPackScope = "company" | "projects";

export interface DocumentPackRequest {
  scope: DocumentPackScope;
  projectIds: string[];
  projectName: string;
  projectNamesById: Record<string, string>;
  dateFrom: string;
  dateTo: string;
  sections: DocumentPackSection[];
  workers: Worker[];
  plant: PlantAsset[];
  exportedBy?: string | null;
}

export interface DocumentPackMaintenanceEntry {
  date: string;
  description: string;
  source: string;
}

export interface DocumentPackPlantRecord {
  id: string;
  unitNumber: string;
  name: string | null;
  plantName: string;
  make: string | null;
  model: string | null;
  photoUrl: string | null;
  currentHours: number | null;
  nextServiceHours: number | null;
  lastServiceDate: string | null;
  lastMaintenanceDate: string | null;
  lastPrestartDate: string | null;
  projectLabel: string;
  assignedWorkerName: string | null;
  maintenanceHistory: DocumentPackMaintenanceEntry[];
}

export type DocumentPackItcStage = "Inputted" | "In Progress" | "Completed";

export interface DocumentPackData {
  organization: CompanyProfileRecord | null;
  scope: DocumentPackScope;
  projectId: string;
  projectName: string;
  projectNamesById: Record<string, string>;
  dateFrom: string;
  dateTo: string;
  exportTimestamp: string;
  sections: DocumentPackSection[];
  itps: ProjectItp[];
  itcs: DocumentPackItcRecord[];
  swms: SwmsDocumentSummary[];
  plantRecords: DocumentPackPlantRecord[];
  swmsMatrices: Array<{
    swms: SwmsDocumentSummary;
    rows: ReturnType<typeof buildSwmsWorkerSignOffMatrix>;
  }>;
}

export const DOCUMENT_PACK_CSV_COLUMNS = [
  "Document Title",
  "Type",
  "Worker Name",
  "Project",
  "Date",
  "Status",
] as const;

export type DocumentPackCsvColumn = (typeof DOCUMENT_PACK_CSV_COLUMNS)[number];
export type DocumentPackCsvRow = Record<DocumentPackCsvColumn, string>;

export interface DocumentPackExportLog {
  id: string;
  project_id: string;
  project_name: string | null;
  date_from: string;
  date_to: string;
  included_sections: DocumentPackSection[];
  file_name: string;
  exported_at: string;
  exported_by: string | null;
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

export interface DocumentPackItcRecord {
  id: string;
  project_id: string;
  itp_id: string | null;
  itpName: string;
  itc_number: string;
  title: string;
  status: string;
  stage: DocumentPackItcStage;
  service_discipline: string;
  form_data: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  detail: ItcDetailBundle | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function matchesProjectScope(
  projectId: string | null | undefined,
  projectIds: string[]
): boolean {
  if (projectIds.length === 0) return true;
  const id = str(projectId);
  return Boolean(id) && projectIds.includes(id);
}

export function resolveProjectLabel(
  projectId: string | null | undefined,
  projectNamesById: Record<string, string>,
  fallback: string
): string {
  const id = str(projectId);
  if (!id) return fallback;
  return projectNamesById[id]?.trim() || fallback;
}

export function packDateBounds(dateFrom: string, dateTo: string): {
  startDate: string;
  endDate: string;
  start: string;
  end: string;
} {
  const startDate = dateFrom.trim().slice(0, 10);
  const endDate = dateTo.trim().slice(0, 10);
  return {
    startDate,
    endDate,
    start: `${startDate}T00:00:00.000`,
    end: `${endDate}T23:59:59.999`,
  };
}

export function isDateInRange(
  value: string | null | undefined,
  dateFrom: string,
  dateTo: string
): boolean {
  if (!value?.trim()) return false;
  const { startDate, endDate, start, end } = packDateBounds(dateFrom, dateTo);
  const raw = value.trim();
  const day = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day >= startDate && day <= endDate) {
    return true;
  }
  const timestamp = Date.parse(raw.includes("T") ? raw : `${day}T12:00:00.000`);
  if (!Number.isFinite(timestamp)) return false;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return timestamp >= startMs && timestamp <= endMs;
}

function resolveRecordDate(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value?.trim()) return value.trim().slice(0, 10);
  }
  return "";
}

function rowMatchesPackDateRange(
  row: Record<string, unknown>,
  dateFrom: string,
  dateTo: string
): boolean {
  const date = str(row.date);
  const inspectionDate = str(row.inspection_date);
  const createdAt = str(row.created_at);
  const updatedAt = str(row.updated_at);
  const completedAt = str(row.completed_at);

  const primaryHit =
    isDateInRange(date, dateFrom, dateTo) ||
    isDateInRange(inspectionDate, dateFrom, dateTo) ||
    isDateInRange(completedAt, dateFrom, dateTo);
  const createdHit = isDateInRange(createdAt, dateFrom, dateTo);
  const updatedHit = isDateInRange(updatedAt, dateFrom, dateTo);

  if (primaryHit || createdHit || updatedHit) return true;
  return !date && !inspectionDate && !createdAt && !updatedAt && !completedAt;
}

function mapPackItpRow(row: Record<string, unknown>): ProjectItp {
  return {
    id: str(row.id),
    project_id: str(row.project_id),
    itp_number: str(row.itp_number) || str(row.id).slice(0, 8),
    title: str(row.title) || "ITP",
    revision: str(row.revision) || "A",
    trade_category: str(row.trade_category) || "—",
    subcontractor_name: str(row.subcontractor_name) || null,
    location_area: str(row.location_area) || null,
    status: (str(row.status) || "draft") as ProjectItp["status"],
    template_key: str(row.template_key) || null,
    created_at: str(row.created_at) || undefined,
    updated_at: str(row.updated_at) || undefined,
    items: [],
  };
}

export function mapItcStage(status: string | null | undefined): DocumentPackItcStage {
  const value = str(status).toLowerCase();
  if (
    value === "complete" ||
    value === "completed" ||
    value === "closed" ||
    value === "signed"
  ) {
    return "Completed";
  }
  if (
    value === "not_started" ||
    value === "draft" ||
    value === "new" ||
    value === "inputted" ||
    value === ""
  ) {
    return "Inputted";
  }
  return "In Progress";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    const mapped = await Promise.all(chunk.map(mapper));
    results.push(...mapped);
  }
  return results;
}

function latestIsoDate(values: Array<string | null | undefined>): string | null {
  const dates = values
    .map((value) => str(value).slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates.at(-1) ?? null;
}

function mapPackItcRow(row: Record<string, unknown>): DocumentPackItcRecord {
  const status = str(row.status) || "draft";
  return {
    id: str(row.id),
    project_id: str(row.project_id),
    itp_id: str(row.itp_id) || null,
    itpName: "",
    itc_number: str(row.itc_number) || str(row.activity_number) || str(row.id).slice(0, 8),
    title: str(row.title) || str(row.activity_number) || "ITC",
    status,
    stage: mapItcStage(status),
    service_discipline: str(row.service_discipline) || str(row.trade_discipline) || "—",
    form_data:
      row.form_data && typeof row.form_data === "object" && !Array.isArray(row.form_data)
        ? (row.form_data as Record<string, unknown>)
        : {},
    created_at: str(row.created_at) || null,
    updated_at: str(row.updated_at) || null,
    detail: null,
  };
}

async function fetchItpsForPack(
  projectIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<{ rows: ProjectItp[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { rows: [], error: null };
  }

  try {
    let query = supabase.from(PROJECT_ITPS_TABLE).select("*");
    if (projectIds.length > 0) {
      query = query.in("project_id", projectIds);
    }

    const { data, error } = await query;

    if (error) {
      if (!isMissingTableError(error.message, "project_itps")) {
        console.warn("fetchItpsForPack failed:", error.message);
      }
      return { rows: [], error: error.message };
    }

    const results: ProjectItp[] = [];
    for (const raw of data ?? []) {
      const row = asRecord(raw);
      if (!matchesProjectScope(str(row.project_id), projectIds)) continue;

      const hydrated = await fetchItpById(str(row.id)).catch(() => null);
      const itp = hydrated ?? mapPackItpRow(row);
      const signedInRange = (itp.items ?? []).some((item) =>
        isDateInRange(item.signed_off_at, dateFrom, dateTo)
      );
      if (
        rowMatchesPackDateRange(row, dateFrom, dateTo) ||
        isDateInRange(itp.created_at, dateFrom, dateTo) ||
        isDateInRange(itp.updated_at, dateFrom, dateTo) ||
        signedInRange
      ) {
        results.push(itp);
      }
    }

    return { rows: results, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load ITPs.";
    console.warn("fetchItpsForPack threw:", error);
    return { rows: [], error: message };
  }
}

async function fetchItcsForPack(
  projectIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<{ rows: DocumentPackItcRecord[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { rows: [], error: null };
  }

  try {
    let query = supabase.from(PROJECT_ITCS_TABLE).select("*");
    if (projectIds.length > 0) {
      query = query.in("project_id", projectIds);
    }

    const { data, error } = await query;

    if (error) {
      if (!isMissingTableError(error.message, "project_itcs")) {
        console.warn("fetchItcsForPack failed:", error.message);
      }
      return { rows: [], error: error.message };
    }

    const rows = (data ?? [])
      .map((raw) => asRecord(raw))
      .filter((row) => matchesProjectScope(str(row.project_id), projectIds))
      .filter((row) => rowMatchesPackDateRange(row, dateFrom, dateTo))
      .map(mapPackItcRow);

    return { rows, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load ITCs.";
    console.warn("fetchItcsForPack threw:", error);
    return { rows: [], error: message };
  }
}

async function fetchLastServiceDates(
  plantIds: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!isSupabaseConfigured() || plantIds.length === 0) return map;

  for (const table of ["plant_equipment", "plant"] as const) {
    const { data, error } = await supabase
      .from(table)
      .select("id, last_service_date")
      .in("id", plantIds);

    if (error) {
      if (!isMissingTableError(error.message, table)) {
        console.warn(`fetchLastServiceDates ${table} failed:`, error.message);
      }
      continue;
    }

    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const lastService = (row as { last_service_date?: string | null }).last_service_date;
      if (id && lastService && !map.has(id)) {
        map.set(id, String(lastService).slice(0, 10));
      }
    }
  }

  return map;
}

async function fetchServiceSchedulesForPlant(
  plantIds: string[],
  dateFrom: string,
  dateTo: string
): Promise<Map<string, DocumentPackMaintenanceEntry[]>> {
  const map = new Map<string, DocumentPackMaintenanceEntry[]>();
  if (!isSupabaseConfigured() || plantIds.length === 0) return map;

  const { data, error } = await supabase
    .from("plant_service_schedules")
    .select("*")
    .in("plant_id", plantIds)
    .gte("scheduled_date", dateFrom)
    .lte("scheduled_date", dateTo)
    .order("scheduled_date", { ascending: false });

  if (error) {
    if (!isMissingTableError(error.message, "plant_service_schedules")) {
      console.warn("fetchServiceSchedulesForPlant failed:", error.message);
    }
    return map;
  }

  for (const row of data ?? []) {
    const record = row as {
      plant_id?: string;
      scheduled_date?: string;
      service_type?: string;
      technician_notes?: string | null;
      completed?: boolean;
    };
    const plantId = String(record.plant_id ?? "");
    if (!plantId) continue;

    const entry: DocumentPackMaintenanceEntry = {
      date: String(record.scheduled_date ?? "").slice(0, 10),
      description: [
        record.service_type ?? "Scheduled service",
        record.technician_notes?.trim(),
        record.completed ? "(Completed)" : "(Scheduled)",
      ]
        .filter(Boolean)
        .join(" — "),
      source: "Service schedule",
    };

    const list = map.get(plantId) ?? [];
    list.push(entry);
    map.set(plantId, list);
  }

  return map;
}

function buildMaintenanceFromDocuments(
  documents: PlantDocumentRecord[],
  dateFrom: string,
  dateTo: string
): DocumentPackMaintenanceEntry[] {
  return documents
    .filter((doc) => doc.category === "service_maintenance")
    .filter((doc) => isDateInRange(doc.uploaded_at, dateFrom, dateTo))
    .map((doc) => ({
      date: doc.uploaded_at.slice(0, 10),
      description: doc.name || PLANT_DOCUMENT_CATEGORY_LABELS.service_maintenance,
      source: "Document upload",
    }));
}

function buildPlantPackRecords(input: {
  assignedPlant: PlantAsset[];
  lastServiceDates: Map<string, string | null>;
  prestarts: Awaited<ReturnType<typeof fetchPlantPrestarts>>;
  serviceSchedules: Map<string, DocumentPackMaintenanceEntry[]>;
  maintenanceRows: Awaited<ReturnType<typeof fetchPlantMaintenance>>;
  dateFrom: string;
  dateTo: string;
  projectNamesById: Record<string, string>;
  plantByProject: Map<string, string[]>;
  fallbackProjectLabel: string;
}): DocumentPackPlantRecord[] {
  const prestartsByPlant = new Map<string, typeof input.prestarts>();
  for (const prestart of input.prestarts) {
    const list = prestartsByPlant.get(prestart.plant_id) ?? [];
    list.push(prestart);
    prestartsByPlant.set(prestart.plant_id, list);
  }

  return input.assignedPlant.map((item) => {
    const documents = hydratePlantDocumentsFromLegacy(item);
    const docHistory = buildMaintenanceFromDocuments(
      documents,
      input.dateFrom,
      input.dateTo
    );

    const prestartHistory = (prestartsByPlant.get(item.id) ?? [])
      .filter((prestart) => isDateInRange(prestart.created_at, input.dateFrom, input.dateTo))
      .map((prestart) => ({
        date: prestart.created_at.slice(0, 10),
        description: prestart.repair_notes?.trim()
          ? `Repair: ${prestart.repair_notes.trim()}`
          : prestart.has_defect
            ? `Defect reported: ${prestart.defect_comments?.trim() || "See pre-start record"}`
            : "Pre-start inspection",
        source: "Pre-start / maintenance",
      }));

    const scheduleHistory = input.serviceSchedules.get(item.id) ?? [];

    const maintenanceHistory = [...docHistory, ...prestartHistory, ...scheduleHistory].sort(
      (left, right) => right.date.localeCompare(left.date)
    );

    const assignedProjectIds = getPlantAssignedProjectIds(
      item,
      input.plantByProject.get(item.id) ?? []
    );
    const projectLabel =
      assignedProjectIds
        .map((id) => input.projectNamesById[id]?.trim())
        .filter(Boolean)
        .join(", ") || input.fallbackProjectLabel;

    const plantMaintenance = input.maintenanceRows.filter(
      (row) => row.plant_id === item.id
    );
    const lastServiceFromMaintenance = latestIsoDate(
      plantMaintenance
        .filter((row) => row.maintenance_type === "service")
        .map((row) => row.completed_at ?? row.scheduled_date)
    );
    const lastMaintenanceDate = latestIsoDate(
      plantMaintenance
        .filter((row) => row.maintenance_type === "maintenance")
        .map((row) => row.completed_at ?? row.scheduled_date)
    );
    const latestPrestart = getLatestPrestartByPlant(
      prestartsByPlant.get(item.id) ?? []
    ).get(item.id);
    const unitNumber = item.unit_number || item.plant_number || item.id.slice(0, 8);

    return {
      id: item.id,
      unitNumber,
      name: item.name ?? null,
      plantName: item.name?.trim() || unitNumber,
      make: item.make,
      model: item.model,
      photoUrl: item.photo_url ?? null,
      currentHours: item.current_hours,
      nextServiceHours: item.next_service_hours,
      lastServiceDate: latestIsoDate([
        input.lastServiceDates.get(item.id),
        lastServiceFromMaintenance,
      ]),
      lastMaintenanceDate,
      lastPrestartDate: latestIsoDate([
        latestPrestart?.submitted_at,
        latestPrestart?.created_at,
      ]),
      projectLabel,
      assignedWorkerName: item.assigned_worker_name ?? null,
      maintenanceHistory,
    };
  });
}

export async function fetchDocumentPackData(
  request: Omit<DocumentPackRequest, "exportedBy">
): Promise<DocumentPackData> {
  const exportTimestamp = new Date().toISOString();
  const organization = await loadCompanyProfile();

  const includeItps = request.sections.includes("itps");
  const includeSwms = request.sections.includes("swms");
  const includePlant = request.sections.includes("plant");

  const projectIds =
    request.scope === "projects"
      ? request.projectIds.map((id) => id.trim()).filter(Boolean)
      : [];
  const { startDate, endDate } = packDateBounds(request.dateFrom, request.dateTo);
  const packProjectId =
    request.scope === "company" ? "company-wide" : projectIds.join(",") || "projects";

  const [itpResult, itcResult, swms, assignmentMaps] = await Promise.all([
    includeItps
      ? fetchItpsForPack(projectIds, request.dateFrom, request.dateTo)
      : Promise.resolve({ rows: [], error: null }),
    includeItps
      ? fetchItcsForPack(projectIds, request.dateFrom, request.dateTo)
      : Promise.resolve({ rows: [], error: null }),
    includeSwms ? fetchSwmsDocumentsForPack(projectIds) : Promise.resolve([]),
    loadAssignmentMaps(),
  ]);

  const itps = itpResult.rows;
  const itpNameById = new Map(
    itps.map((itp) => [itp.id, itp.title || itp.itp_number || "ITP"] as const)
  );
  let itcs = itcResult.rows.map((itc) => ({
    ...itc,
    itpName: itc.itp_id ? itpNameById.get(itc.itp_id) ?? "" : "",
  }));

  if (includeItps && itcs.length > 0) {
    const details = await mapWithConcurrency(itcs, 4, async (itc) => {
      const detail = await fetchItcDetail(itc.id).catch(() => null);
      return { id: itc.id, detail };
    });
    const detailById = new Map(details.map((row) => [row.id, row.detail]));
    itcs = itcs.map((itc) => {
      const detail = detailById.get(itc.id) ?? null;
      const status = detail?.itc.status ?? itc.status;
      return {
        ...itc,
        status,
        stage: mapItcStage(status),
        form_data: detail?.itc.form_data ?? itc.form_data,
        itp_id: itc.itp_id || detail?.itc.itp_id || null,
        itpName:
          itc.itpName ||
          (detail?.itc.itp_id ? itpNameById.get(detail.itc.itp_id) ?? "" : ""),
        detail,
      };
    });
  }

  console.log("[Document Pack Query]:", {
    scope: request.scope,
    projectIds,
    dateRange: { start: `${startDate}T00:00:00.000`, end: `${endDate}T23:59:59.999` },
    itpsFound: itps.length || 0,
    itcsFound: itcs.length || 0,
    itpError: itpResult.error,
    itcError: itcResult.error,
  });

  const filteredSwms = includeSwms
    ? swms.filter((doc) => {
        const docDate = resolveRecordDate(
          getSwmsDocumentDate(doc),
          doc.created_at,
          doc.updated_at
        );
        const assignmentSignedInRange = (doc.assignments ?? []).some((assignment) =>
          isDateInRange(assignment.signed_at, request.dateFrom, request.dateTo)
        );
        return (
          isDateInRange(docDate, request.dateFrom, request.dateTo) ||
          assignmentSignedInRange ||
          (doc.assignments?.length ?? 0) > 0
        );
      })
    : [];

  const scopedWorkers =
    projectIds.length === 0
      ? request.workers
      : request.workers.filter((worker) =>
          projectIds.some((projectId) =>
            filterWorkersForProject(
              [worker],
              projectId,
              assignmentMaps.workerByProject
            ).length > 0
          )
        );

  const projectWorkers = scopedWorkers
    .filter((worker) => !worker.is_subcontractor)
    .map((worker) => ({
      id: worker.id,
      name: getWorkerDisplayName(worker),
    }));

  const swmsMatrices = filteredSwms.map((doc) => ({
    swms: doc,
    rows: buildSwmsWorkerSignOffMatrix(projectWorkers, doc.assignments ?? []),
  }));

  let plantRecords: DocumentPackPlantRecord[] = [];
  if (includePlant) {
    const assignedPlant =
      projectIds.length === 0
        ? request.plant
        : request.plant.filter((asset) =>
            getPlantAssignedProjectIds(
              asset,
              assignmentMaps.plantByProject.get(asset.id) ?? []
            ).some((id) => projectIds.includes(id))
          );
    const plantIds = assignedPlant.map((item) => item.id);
    const [lastServiceDates, serviceSchedules, prestarts, maintenanceRows] =
      await Promise.all([
        fetchLastServiceDates(plantIds),
        fetchServiceSchedulesForPlant(plantIds, request.dateFrom, request.dateTo),
        fetchPlantPrestarts({
          plantIds,
          limit: Math.max(plantIds.length * 5, 400),
        }),
        fetchPlantMaintenance(plantIds),
      ]);

    plantRecords = buildPlantPackRecords({
      assignedPlant,
      lastServiceDates,
      prestarts,
      serviceSchedules,
      maintenanceRows,
      dateFrom: request.dateFrom,
      dateTo: request.dateTo,
      projectNamesById: request.projectNamesById,
      plantByProject: assignmentMaps.plantByProject,
      fallbackProjectLabel: request.projectName,
    });
  }

  return {
    organization,
    scope: request.scope,
    projectId: packProjectId,
    projectName: request.projectName,
    projectNamesById: request.projectNamesById,
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    exportTimestamp,
    sections: request.sections,
    itps,
    itcs,
    swms: filteredSwms,
    plantRecords,
    swmsMatrices,
  };
}

export function buildDocumentPackFileName(projectName: string, exportDate?: string): string {
  const safeProject = projectName
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60) || "Project";
  const dateStamp = (exportDate ?? new Date().toISOString()).slice(0, 10);
  return `${safeProject}_Document_Pack_${dateStamp}.pdf`;
}

function csvRow(
  title: string,
  type: string,
  workerName: string,
  project: string,
  date: string,
  status: string
): DocumentPackCsvRow {
  return {
    "Document Title": title,
    Type: type,
    "Worker Name": workerName,
    Project: project,
    Date: date.slice(0, 10),
    Status: status,
  };
}

export function buildDocumentPackCsvRows(data: DocumentPackData): DocumentPackCsvRow[] {
  const rows: DocumentPackCsvRow[] = [];
  const fallbackProject = data.projectName || "Company Wide";
  const names = data.projectNamesById ?? {};

  if (data.sections.includes("itps")) {
    for (const itp of data.itps) {
      rows.push(
        csvRow(
          itp.title || itp.itp_number || "ITP",
          "ITP",
          itp.subcontractor_name ?? "",
          resolveProjectLabel(itp.project_id, names, fallbackProject),
          itp.updated_at || itp.created_at || data.dateTo,
          formatItpStatusLabel(itp.status)
        )
      );
    }
    for (const itc of data.itcs) {
      rows.push(
        csvRow(
          itc.title || itc.itc_number || "ITC",
          "ITC",
          "",
          resolveProjectLabel(itc.project_id, names, fallbackProject),
          itc.updated_at || itc.created_at || data.dateTo,
          itc.status || ""
        )
      );
    }
  }

  if (data.sections.includes("swms")) {
    for (const swms of data.swms) {
      const project = resolveProjectLabel(swms.project_id, names, fallbackProject);
      const date = resolveRecordDate(
        getSwmsDocumentDate(swms),
        swms.created_at,
        swms.updated_at
      );
      const assignments = swms.assignments ?? [];
      if (assignments.length === 0) {
        rows.push(
          csvRow(
            swms.title || "SWMS",
            "SWMS",
            "",
            project,
            date,
            swms.status || ""
          )
        );
        continue;
      }
      for (const assignment of assignments) {
        rows.push(
          csvRow(
            swms.title || "SWMS",
            "SWMS",
            getSwmsAssigneeName(assignment),
            project,
            assignment.signed_at || date,
            formatSwmsAssignmentStatus(assignment.status ?? "", assignment.signed_at ?? null)
          )
        );
      }
    }
  }

  if (data.sections.includes("plant")) {
    for (const plant of data.plantRecords) {
      rows.push(
        csvRow(
          [plant.unitNumber, plant.name].filter(Boolean).join(" — ") || "Plant",
          "Plant",
          plant.assignedWorkerName ?? "",
          plant.projectLabel || fallbackProject,
          plant.lastServiceDate || data.dateTo,
          plant.lastServiceDate ? "In service" : "Registered"
        )
      );
    }
  }

  return rows;
}

export function formatSignedWorkersCell(
  rows: ReturnType<typeof buildSwmsWorkerSignOffMatrix>
): string {
  return rows
    .filter((row) => row.status === "Signed")
    .map((row) =>
      row.signedAt
        ? `${row.workerName} (${row.signedAt.slice(0, 10)})`
        : row.workerName
    )
    .join("; ");
}

function isUnsignedSignOffRow(
  row: ReturnType<typeof buildSwmsWorkerSignOffMatrix>[number]
): boolean {
  return row.status === "Pending" || row.status === "Not Assigned";
}

export function formatUnsignedWorkersCell(
  rows: ReturnType<typeof buildSwmsWorkerSignOffMatrix>
): string {
  return rows
    .filter(isUnsignedSignOffRow)
    .map((row) => row.workerName)
    .join("; ");
}

export function buildDocumentPackExcelSheets(data: DocumentPackData): {
  plant: Array<Record<string, string>>;
  swms: Array<Record<string, string>>;
  itpItc: Array<Record<string, string>>;
} {
  const names = data.projectNamesById ?? {};
  const fallback = data.projectName || "Company Wide";

  const plant = data.plantRecords.map((item) => ({
    "Plant Name": item.plantName || item.unitNumber,
    Make: item.make ?? "",
    Model: item.model ?? "",
    "Current Hours": item.currentHours != null ? String(item.currentHours) : "",
    "Next Service Due Hours":
      item.nextServiceHours != null ? String(item.nextServiceHours) : "",
    "Last Service Date": item.lastServiceDate ?? "",
    "Last Maintenance Date": item.lastMaintenanceDate ?? "",
    "Last Pre-start Date": item.lastPrestartDate ?? "",
    "Current Project Assignment": item.projectLabel || fallback,
  }));

  const swmsMatrixById = new Map(
    data.swmsMatrices.map((block) => [block.swms.id, block.rows])
  );
  const swms = data.swms.map((doc) => {
    const scope = resolveSwmsScope(doc) === "site_specific" ? "Site Specific" : "Company";
    const rows =
      swmsMatrixById.get(doc.id) ??
      buildSwmsWorkerSignOffMatrix([], doc.assignments ?? []);
    return {
      "SWMS Name": doc.title || "SWMS",
      Scope: scope,
      "Project Name":
        scope === "Site Specific"
          ? resolveProjectLabel(doc.project_id, names, fallback)
          : "",
      "Signed Workers": formatSignedWorkersCell(rows),
      "Unsigned Workers": formatUnsignedWorkersCell(rows),
    };
  });

  const itpItc: Array<Record<string, string>> = [];
  const itcsByItp = new Map<string, DocumentPackItcRecord[]>();
  for (const itc of data.itcs) {
    const key = itc.itp_id || "__unlinked__";
    const list = itcsByItp.get(key) ?? [];
    list.push(itc);
    itcsByItp.set(key, list);
  }

  for (const itp of data.itps) {
    const linked = itcsByItp.get(itp.id) ?? [];
    if (linked.length === 0) {
      itpItc.push({
        "ITP Name": itp.title || itp.itp_number,
        "Project/Site": resolveProjectLabel(itp.project_id, names, fallback),
        "ITC Name/Identifier": "",
        Stage: mapItcStage(itp.status),
      });
      continue;
    }
    for (const itc of linked) {
      itpItc.push({
        "ITP Name": itp.title || itp.itp_number,
        "Project/Site": resolveProjectLabel(
          itc.project_id || itp.project_id,
          names,
          fallback
        ),
        "ITC Name/Identifier": itc.itc_number || itc.title,
        Stage: itc.stage,
      });
    }
  }

  const linkedItpIds = new Set(data.itps.map((itp) => itp.id));
  for (const itc of data.itcs) {
    if (itc.itp_id && linkedItpIds.has(itc.itp_id)) continue;
    itpItc.push({
      "ITP Name": itc.itpName || "",
      "Project/Site": resolveProjectLabel(itc.project_id, names, fallback),
      "ITC Name/Identifier": itc.itc_number || itc.title,
      Stage: itc.stage,
    });
  }

  return { plant, swms, itpItc };
}

export async function logDocumentPackExport(input: {
  projectId: string;
  projectName: string;
  dateFrom: string;
  dateTo: string;
  sections: DocumentPackSection[];
  fileName: string;
  exportedBy?: string | null;
}): Promise<{ error: string | null; log?: DocumentPackExportLog }> {
  if (!isSupabaseConfigured()) {
    return { error: null };
  }

  const payload = {
    project_id: input.projectId,
    project_name: input.projectName,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    included_sections: input.sections,
    file_name: input.fileName,
    exported_by: input.exportedBy?.trim() || null,
    exported_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("document_pack_exports")
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    if (isMissingTableError(error.message, "document_pack_exports")) {
      console.warn("document_pack_exports table missing; run migration 049.");
      return { error: null };
    }
    return { error: error.message };
  }

  return {
    error: null,
    log: {
      id: String(data.id),
      project_id: String(data.project_id),
      project_name: data.project_name ?? null,
      date_from: String(data.date_from).slice(0, 10),
      date_to: String(data.date_to).slice(0, 10),
      included_sections: (data.included_sections ?? []) as DocumentPackSection[],
      file_name: String(data.file_name),
      exported_at: String(data.exported_at),
      exported_by: data.exported_by ?? null,
    },
  };
}

export function formatItpStatusLabel(status: ProjectItp["status"]): string {
  return ITP_STATUS_LABELS[status] ?? status;
}

export function formatItpItemStatus(status: string): string {
  return ITP_ITEM_STATUS_LABELS[status as keyof typeof ITP_ITEM_STATUS_LABELS] ?? status;
}

export function formatItpPointType(pointType: string): string {
  return ITP_POINT_TYPE_LABELS[pointType as keyof typeof ITP_POINT_TYPE_LABELS] ?? pointType;
}

export function formatSwmsAssignmentStatus(
  status: string,
  signedAt: string | null
): string {
  if (status === "Signed") {
    return signedAt
      ? `Signed ${new Date(signedAt).toLocaleString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`
      : "Signed";
  }
  return status === "Pending" ? "Not Signed" : status;
}

export function getSwmsAssigneeDisplayName(
  assignment: SwmsDocumentSummary["assignments"] extends (infer T)[] | undefined ? T : never
): string {
  return getSwmsAssigneeName(assignment);
}

export { formatSwmsVersionLabel, getSwmsDocumentDate };
