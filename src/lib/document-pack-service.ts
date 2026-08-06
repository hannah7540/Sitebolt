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

export function isDateInRange(
  value: string | null | undefined,
  dateFrom: string,
  dateTo: string
): boolean {
  if (!value?.trim()) return false;
  const date = value.trim().slice(0, 10);
  return date >= dateFrom && date <= dateTo;
}

function resolveRecordDate(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value?.trim()) return value.trim().slice(0, 10);
  }
  return "";
}

async function fetchCompletedItpsForPack(
  projectId: string,
  dateFrom: string,
  dateTo: string
): Promise<ProjectItp[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("project_itps")
    .select("*")
    .eq("project_id", projectId)
    .in("status", ["approved", "submitted"])
    .order("updated_at", { ascending: false });

  if (error) {
    if (!isMissingTableError(error.message, "project_itps")) {
      console.warn("fetchCompletedItpsForPack failed:", error.message);
    }
    return [];
  }

  const candidates = (data ?? []) as Array<Record<string, unknown>>;
  const results: ProjectItp[] = [];

  for (const row of candidates) {
    const itp = await fetchItpById(String(row.id ?? ""));
    if (!itp) continue;

    const recordDate = resolveRecordDate(itp.updated_at, itp.created_at);
    const hasSignedItemInRange = (itp.items ?? []).some((item) =>
      isDateInRange(item.signed_off_at, dateFrom, dateTo)
    );

    if (isDateInRange(recordDate, dateFrom, dateTo) || hasSignedItemInRange) {
      results.push(itp);
    }
  }

  return results;
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

  const [itps, swms, assignmentMaps] = await Promise.all([
    includeItps
      ? fetchCompletedItpsForPack(request.projectId, request.dateFrom, request.dateTo)
      : Promise.resolve([]),
    includeSwms ? fetchProjectSwmsDocuments(request.projectId) : Promise.resolve([]),
    loadAssignmentMaps(),
  ]);

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
