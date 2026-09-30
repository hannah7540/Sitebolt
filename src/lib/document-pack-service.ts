import { supabase, isSupabaseConfigured, fetchPlantPrestarts, type PlantAsset } from "./supabase";
import { loadCompanyProfile, type CompanyProfileRecord } from "./company-profile-service";
import { fetchItpById, type ProjectItp } from "./itp-service";
import { ITP_ITEM_STATUS_LABELS, ITP_POINT_TYPE_LABELS, ITP_STATUS_LABELS } from "./itp-templates";
import {
  buildSwmsWorkerSignOffMatrix,
  fetchProjectSwmsDocuments,
  formatSwmsVersionLabel,
  getSwmsAssigneeName,
  getSwmsDocumentDate,
  type SwmsDocumentSummary,
} from "./swms";
import {
  filterPlantForProject,
  filterWorkersForProject,
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

export interface DocumentPackRequest {
  projectId: string;
  projectName: string;
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
  make: string | null;
  model: string | null;
  photoUrl: string | null;
  currentHours: number | null;
  nextServiceHours: number | null;
  lastServiceDate: string | null;
  maintenanceHistory: DocumentPackMaintenanceEntry[];
}

export interface DocumentPackData {
  organization: CompanyProfileRecord | null;
  projectId: string;
  projectName: string;
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
  itc_number: string;
  title: string;
  status: string;
  service_discipline: string;
  created_at: string | null;
  updated_at: string | null;
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

function mapPackItcRow(row: Record<string, unknown>): DocumentPackItcRecord {
  return {
    id: str(row.id),
    project_id: str(row.project_id),
    itc_number: str(row.itc_number) || str(row.activity_number) || str(row.id).slice(0, 8),
    title: str(row.title) || str(row.activity_number) || "ITC",
    status: str(row.status) || "draft",
    service_discipline: str(row.service_discipline) || str(row.trade_discipline) || "—",
    created_at: str(row.created_at) || null,
    updated_at: str(row.updated_at) || null,
  };
}

async function fetchItpsForPack(
  projectId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ rows: ProjectItp[]; error: string | null }> {
  const targetProjectId = projectId.trim();
  if (!isSupabaseConfigured() || !targetProjectId) {
    return { rows: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from(PROJECT_ITPS_TABLE)
      .select("*")
      .eq("project_id", targetProjectId);

    if (error) {
      if (!isMissingTableError(error.message, "project_itps")) {
        console.warn("fetchItpsForPack failed:", error.message);
      }
      return { rows: [], error: error.message };
    }

    const results: ProjectItp[] = [];
    for (const raw of data ?? []) {
      const row = asRecord(raw);
      if (str(row.project_id) !== targetProjectId) continue;

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
  projectId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ rows: DocumentPackItcRecord[]; error: string | null }> {
  const targetProjectId = projectId.trim();
  if (!isSupabaseConfigured() || !targetProjectId) {
    return { rows: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from(PROJECT_ITCS_TABLE)
      .select("*")
      .eq("project_id", targetProjectId);

    if (error) {
      if (!isMissingTableError(error.message, "project_itcs")) {
        console.warn("fetchItcsForPack failed:", error.message);
      }
      return { rows: [], error: error.message };
    }

    const rows = (data ?? [])
      .map((raw) => asRecord(raw))
      .filter((row) => str(row.project_id) === targetProjectId)
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
  dateFrom: string;
  dateTo: string;
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

    return {
      id: item.id,
      unitNumber: item.unit_number || item.plant_number || item.id.slice(0, 8),
      name: item.name ?? null,
      make: item.make,
      model: item.model,
      photoUrl: item.photo_url ?? null,
      currentHours: item.current_hours,
      nextServiceHours: item.next_service_hours,
      lastServiceDate: input.lastServiceDates.get(item.id) ?? null,
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

  const targetProjectId = request.projectId.trim();
  const { startDate, endDate } = packDateBounds(request.dateFrom, request.dateTo);

  const [itpResult, itcResult, swms, assignmentMaps] = await Promise.all([
    includeItps
      ? fetchItpsForPack(targetProjectId, request.dateFrom, request.dateTo)
      : Promise.resolve({ rows: [], error: null }),
    includeItps
      ? fetchItcsForPack(targetProjectId, request.dateFrom, request.dateTo)
      : Promise.resolve({ rows: [], error: null }),
    includeSwms ? fetchProjectSwmsDocuments(targetProjectId) : Promise.resolve([]),
    loadAssignmentMaps(),
  ]);

  const itps = itpResult.rows;
  const itcs = itcResult.rows;

  console.log("[Document Pack Query]:", {
    projectId: targetProjectId,
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

  const projectWorkers = filterWorkersForProject(
    request.workers,
    request.projectId,
    assignmentMaps.workerByProject
  )
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
    const assignedPlant = filterPlantForProject(
      request.plant,
      request.projectId,
      assignmentMaps.plantByProject
    );
    const plantIds = assignedPlant.map((item) => item.id);
    const [lastServiceDates, serviceSchedules, prestarts] = await Promise.all([
      fetchLastServiceDates(plantIds),
      fetchServiceSchedulesForPlant(plantIds, request.dateFrom, request.dateTo),
      fetchPlantPrestarts({ projectId: request.projectId, plantIds, limit: 500 }),
    ]);

    plantRecords = buildPlantPackRecords({
      assignedPlant,
      lastServiceDates,
      prestarts,
      serviceSchedules,
      dateFrom: request.dateFrom,
      dateTo: request.dateTo,
    });
  }

  return {
    organization,
    projectId: request.projectId,
    projectName: request.projectName,
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
