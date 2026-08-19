import {
  fetchAllWorkerVocs,
  fetchPlant,
  fetchWorkerById,
  fetchWorkers,
  updatePlant,
  updateWorker,
  type PlantAsset,
  type Worker,
  type WorkerVoc,
} from "./supabase";
import { fetchOrganizationFleet, type OrganizationFleetVehicle } from "./organization-fleet";
import { updateFleetDocumentCompliance, type FleetDocumentType } from "./organization-fleet";
import { collectExpiringFleetAlerts } from "./fleet-utils";
import { hydrateCardsVocsFromWorker, serializeCardsVocs } from "./worker-cards-vocs";
import {
  hydratePlantDocumentsFromLegacy,
  parsePlantDocuments,
  serializePlantDocuments,
  type PlantDocumentRecord,
} from "./plant-documents";
import { daysUntil, getWorkerDisplayName } from "./worker-utils";
import { fleetDocumentTypeLabel } from "./fleet-utils";
import {
  calculateInsuranceDaysRemaining,
  isWithinInsuranceAlertWindow,
  INSURANCE_EXPIRY_ALERT_WINDOW_DAYS,
} from "./insurance-utils";
import {
  listInsuranceRecords,
  mapCompanyInsuranceResponse,
  resolveInsuranceDisplayType,
  type CompanyInsuranceRecord,
} from "./organisation-insurances-api";
import { attachComplianceAlertNavigation } from "./organisation-alert-navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Alert trigger windows (days before due/expiry). */
export const HEAVY_VEHICLE_ALERT_WINDOW_DAYS = 56;
export const FLEET_PLANT_REGISTRATION_ALERT_WINDOW_DAYS = 14;
export const WORKER_TICKET_ALERT_WINDOW_DAYS = 30;
export const COMPANY_INSURANCE_ALERT_WINDOW_DAYS = INSURANCE_EXPIRY_ALERT_WINDOW_DAYS;

export type ComplianceAlertFilter =
  | "all"
  | "heavy_vehicle_check"
  | "fleet_plant_registration"
  | "worker_ticket"
  | "company_insurance";

export type ComplianceAlertCategory =
  | "heavy_vehicle_check"
  | "fleet_registration"
  | "plant_registration"
  | "worker_ticket"
  | "company_insurance";

export type ComplianceAlertSourceType = "worker" | "fleet" | "plant" | "insurance";

export interface ComplianceAlertItem {
  id: string;
  category: ComplianceAlertCategory;
  filterGroup: Exclude<ComplianceAlertFilter, "all">;
  title: string;
  subtitle: string;
  documentLabel: string;
  expiryDate: string;
  daysRemaining: number;
  statusLabel: string;
  statusTone: "critical" | "warning" | "upcoming";
  sourceType: ComplianceAlertSourceType;
  sourceId: string;
  metadata: Record<string, unknown>;
}

export interface ComplianceAlertsSummary {
  alerts: ComplianceAlertItem[];
  counts: Record<Exclude<ComplianceAlertFilter, "all"> | "all", number>;
}

function isWithinWindow(expiryDate: string | null | undefined, windowDays: number): boolean {
  const days = daysUntil(expiryDate);
  if (days === null) return false;
  return days <= windowDays;
}

export function getComplianceAlertStatus(daysRemaining: number): {
  label: string;
  tone: "critical" | "warning" | "upcoming";
  badgeClass: string;
} {
  if (daysRemaining < 0) {
    return {
      label: "Critical — Expired",
      tone: "critical",
      badgeClass: "border-red-200 bg-red-50 text-red-800",
    };
  }
  if (daysRemaining <= 5) {
    return {
      label: `Critical — Expiring in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
      tone: "critical",
      badgeClass: "border-red-200 bg-red-50 text-red-800",
    };
  }
  if (daysRemaining <= 14) {
    return {
      label: `Warning — Expiring in ${daysRemaining} days`,
      tone: "warning",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-900",
    };
  }
  const weeks = Math.ceil(daysRemaining / 7);
  return {
    label: `Warning — Expiring in ${weeks} week${weeks === 1 ? "" : "s"}`,
    tone: weeks <= 8 ? "warning" : "upcoming",
    badgeClass:
      weeks <= 8
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-50 text-slate-700",
  };
}

function withStatus(
  alert: Omit<ComplianceAlertItem, "statusLabel" | "statusTone">
): ComplianceAlertItem {
  const status = getComplianceAlertStatus(alert.daysRemaining);
  return {
    ...alert,
    statusLabel: status.label,
    statusTone: status.tone,
  };
}

export function collectHeavyVehicleCheckAlerts(plantRows: PlantAsset[]): ComplianceAlertItem[] {
  const alerts: ComplianceAlertItem[] = [];

  for (const plant of plantRows) {
    if (!plant.heavy_vehicle_check_required) continue;
    const dueDate = plant.next_heavy_vehicle_check_due_date;
    if (!isWithinWindow(dueDate, HEAVY_VEHICLE_ALERT_WINDOW_DAYS)) continue;

    const daysRemaining = daysUntil(dueDate)!;
    alerts.push(
      withStatus({
        id: `plant-hv:${plant.id}:${dueDate!.slice(0, 10)}`,
        category: "heavy_vehicle_check",
        filterGroup: "heavy_vehicle_check",
        title: plant.unit_number,
        subtitle: [plant.make, plant.model].filter(Boolean).join(" ") || "Plant equipment",
        documentLabel: "Heavy Vehicle Inspection",
        expiryDate: dueDate!.slice(0, 10),
        daysRemaining,
        sourceType: "plant",
        sourceId: plant.id,
        metadata: {
          alertKind: "heavy_vehicle_check",
          lastCheckDate: plant.last_heavy_vehicle_check_date ?? null,
        },
      })
    );
  }

  return alerts;
}

export function collectPlantRegistrationAlerts(plantRows: PlantAsset[]): ComplianceAlertItem[] {
  const alerts: ComplianceAlertItem[] = [];

  for (const plant of plantRows) {
    const documents = hydratePlantDocumentsFromLegacy(plant);
    for (const doc of documents) {
      if (doc.category !== "registration_insurance") continue;
      if (!isWithinWindow(doc.expiry_date, FLEET_PLANT_REGISTRATION_ALERT_WINDOW_DAYS)) continue;

      const daysRemaining = daysUntil(doc.expiry_date)!;
      alerts.push(
        withStatus({
          id: `plant-reg:${plant.id}:${doc.id}:${doc.expiry_date!.slice(0, 10)}`,
          category: "plant_registration",
          filterGroup: "fleet_plant_registration",
          title: plant.unit_number,
          subtitle: doc.name || "Registration & Insurance",
          documentLabel: "Plant Registration / Insurance",
          expiryDate: doc.expiry_date!.slice(0, 10),
          daysRemaining,
          sourceType: "plant",
          sourceId: plant.id,
          metadata: {
            alertKind: "plant_registration",
            documentId: doc.id,
            documentName: doc.name,
          },
        })
      );
    }
  }

  return alerts;
}

export function collectFleetRegistrationAlerts(
  vehicles: OrganizationFleetVehicle[]
): ComplianceAlertItem[] {
  const fleetAlerts = collectExpiringFleetAlerts(
    vehicles,
    FLEET_PLANT_REGISTRATION_ALERT_WINDOW_DAYS
  );

  return fleetAlerts.map((item) =>
    withStatus({
      id: `fleet:${item.vehicle.id}:${item.documentType}:${item.expiryDate.slice(0, 10)}`,
      category: "fleet_registration",
      filterGroup: "fleet_plant_registration",
      title: item.vehicle.unit_number,
      subtitle: `${item.vehicle.make} ${item.vehicle.model}`.trim(),
      documentLabel: fleetDocumentTypeLabel(item.documentType),
      expiryDate: item.expiryDate.slice(0, 10),
      daysRemaining: item.daysRemaining,
      sourceType: "fleet",
      sourceId: item.vehicle.id,
      metadata: {
        alertKind: "fleet_registration",
        documentType: item.documentType,
      },
    })
  );
}

export function collectWorkerTicketAlerts(
  workers: Worker[],
  vocsByWorker: Map<string, WorkerVoc[]>
): ComplianceAlertItem[] {
  const alerts: ComplianceAlertItem[] = [];

  for (const worker of workers) {
    if (worker.is_revoked || worker.is_archived) continue;

    const entries = hydrateCardsVocsFromWorker(worker, vocsByWorker.get(worker.id) ?? []);
    for (const entry of entries) {
      if (!isWithinWindow(entry.expiry_date, WORKER_TICKET_ALERT_WINDOW_DAYS)) continue;

      const daysRemaining = daysUntil(entry.expiry_date)!;
      alerts.push(
        withStatus({
          id: `worker-ticket:${worker.id}:${entry.id}:${entry.expiry_date!.slice(0, 10)}`,
          category: "worker_ticket",
          filterGroup: "worker_ticket",
          title: getWorkerDisplayName(worker),
          subtitle: worker.trade?.trim() || worker.email?.trim() || "Worker",
          documentLabel: entry.ticket_name,
          expiryDate: entry.expiry_date!.slice(0, 10),
          daysRemaining,
          sourceType: "worker",
          sourceId: worker.id,
          metadata: {
            alertKind: "worker_ticket",
            entryId: entry.id,
            ticketName: entry.ticket_name,
          },
        })
      );
    }
  }

  return alerts;
}

function getInsuranceAlertPresentation(daysRemaining: number): {
  statusLabel: string;
  statusTone: "critical" | "warning";
} {
  if (daysRemaining < 0) {
    return { statusLabel: "Expired", statusTone: "critical" };
  }
  return {
    statusLabel: `Expiring Soon (${daysRemaining} day${daysRemaining === 1 ? "" : "s"})`,
    statusTone: "warning",
  };
}

export function collectCompanyInsuranceAlerts(
  policies: CompanyInsuranceRecord[]
): ComplianceAlertItem[] {
  const alerts: ComplianceAlertItem[] = [];
  const seen = new Set<string>();

  for (const policy of policies) {
    const expiryIso = policy?.expiry_date ?? null;
    if (!expiryIso || !isWithinInsuranceAlertWindow(expiryIso)) continue;

    const daysRemaining = calculateInsuranceDaysRemaining(expiryIso);
    if (daysRemaining === null) continue;

    const expiryDate = expiryIso.slice(0, 10);
    const dedupeKey = `company-insurance:${policy.id}:${expiryDate}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const policyType = resolveInsuranceDisplayType(policy);
    const insurer = policy?.provider?.trim() || policy?.insurer?.trim() || "Unknown insurer";
    const policyNumber = policy?.policy_number?.trim() || "—";
    const presentation = getInsuranceAlertPresentation(daysRemaining);

    alerts.push({
      id: dedupeKey,
      category: "company_insurance",
      filterGroup: "company_insurance",
      title: policyType,
      subtitle: `${insurer} · Policy ${policyNumber}`,
      documentLabel: policyType,
      expiryDate,
      daysRemaining,
      statusLabel: presentation.statusLabel,
      statusTone: presentation.statusTone,
      sourceType: "insurance",
      sourceId: policy.id,
      metadata: {
        alertKind: "company_insurance",
        policyType,
        policyNumber: policy?.policy_number?.trim() || null,
        insurer,
        expiryDate,
        documentCount: policy?.documents?.length ?? 0,
      },
    });
  }

  return alerts;
}

async function fetchInsurancePoliciesForAlerts(
  admin?: SupabaseClient
): Promise<CompanyInsuranceRecord[]> {
  try {
    if (admin) {
      const result = await listInsuranceRecords(admin);
      if (result.error) {
        console.warn("Insurance alerts: failed to load policies", result.error);
        return [];
      }
      return (result.data ?? []).map((row) => mapCompanyInsuranceResponse(row));
    }

    if (typeof window === "undefined") return [];

    const response = await fetch("/api/organisation/insurances", { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json().catch(() => null)) as {
      data?: CompanyInsuranceRecord[];
    } | null;
    return Array.isArray(payload?.data) ? payload.data : [];
  } catch (error) {
    console.warn("Insurance alerts: unexpected load failure", error);
    return [];
  }
}

export async function fetchComplianceAlerts(options?: {
  admin?: SupabaseClient;
}): Promise<ComplianceAlertsSummary> {
  try {
    const [workers, vocs, fleet, plant, insurancePolicies] = await Promise.all([
      fetchWorkers(),
      fetchAllWorkerVocs(),
      fetchOrganizationFleet(),
      fetchPlant(),
      fetchInsurancePoliciesForAlerts(options?.admin),
    ]);

    const vocsByWorker = new Map<string, WorkerVoc[]>();
    for (const voc of vocs) {
      const list = vocsByWorker.get(voc.worker_id) ?? [];
      list.push(voc);
      vocsByWorker.set(voc.worker_id, list);
    }

    const alerts = attachComplianceAlertNavigation([
      ...collectHeavyVehicleCheckAlerts(plant),
      ...collectPlantRegistrationAlerts(plant),
      ...collectFleetRegistrationAlerts(fleet),
      ...collectWorkerTicketAlerts(workers, vocsByWorker),
      ...collectCompanyInsuranceAlerts(insurancePolicies),
    ]).sort((left, right) => left.daysRemaining - right.daysRemaining);

    const counts = {
      all: alerts.length,
      heavy_vehicle_check: alerts.filter((row) => row.filterGroup === "heavy_vehicle_check")
        .length,
      fleet_plant_registration: alerts.filter(
        (row) => row.filterGroup === "fleet_plant_registration"
      ).length,
      worker_ticket: alerts.filter((row) => row.filterGroup === "worker_ticket").length,
      company_insurance: alerts.filter((row) => row.filterGroup === "company_insurance").length,
    };

    return { alerts, counts };
  } catch (error) {
    console.error("Failed to build compliance alerts:", error);
    return {
      alerts: [],
      counts: {
        all: 0,
        heavy_vehicle_check: 0,
        fleet_plant_registration: 0,
        worker_ticket: 0,
        company_insurance: 0,
      },
    };
  }
}

export function filterComplianceAlerts(
  alerts: ComplianceAlertItem[],
  filter: ComplianceAlertFilter
): ComplianceAlertItem[] {
  if (filter === "all") return alerts;
  return alerts.filter((row) => row.filterGroup === filter);
}

export interface RenewComplianceAlertInput {
  alert: ComplianceAlertItem;
  expiryDate: string;
  lastCheckDate?: string | null;
  documentFile?: File | null;
  documentUrl?: string | null;
}

export async function renewComplianceAlert(
  input: RenewComplianceAlertInput
): Promise<{ error: string | null }> {
  const { alert, expiryDate } = input;
  const kind = String(alert.metadata.alertKind ?? alert.category);

  if (kind === "fleet_registration" || alert.sourceType === "fleet") {
    const documentType = String(alert.metadata.documentType ?? "rego") as FleetDocumentType;
    return updateFleetDocumentCompliance({
      id: alert.sourceId,
      documentType,
      expiryDate,
      documentUrl: input.documentUrl ?? undefined,
    });
  }

  if (kind === "heavy_vehicle_check") {
    return updatePlant(alert.sourceId, {
      last_heavy_vehicle_check_date:
        input.lastCheckDate?.trim() || new Date().toISOString().slice(0, 10),
      next_heavy_vehicle_check_due_date: expiryDate,
      heavy_vehicle_check_required: true,
    });
  }

  if (kind === "plant_registration") {
    const plant = (await fetchPlant()).find((row) => row.id === alert.sourceId);
    if (!plant) return { error: "Plant record not found." };

    const documentId = String(alert.metadata.documentId ?? "");
    const documents = hydratePlantDocumentsFromLegacy(plant);
    const nextDocuments: PlantDocumentRecord[] = documents.map((doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        expiry_date: expiryDate,
        file_url: input.documentUrl ?? doc.file_url,
        uploaded_at: input.documentUrl ? new Date().toISOString() : doc.uploaded_at,
      };
    });

    return updatePlant(alert.sourceId, {
      plant_documents: serializePlantDocuments(nextDocuments),
    });
  }

  if (kind === "worker_ticket" || alert.sourceType === "worker") {
    const worker = await fetchWorkerById(alert.sourceId);
    if (!worker) return { error: "Worker not found." };

    const entryId = String(alert.metadata.entryId ?? "");
    const vocs = await fetchAllWorkerVocs();
    const workerVocs = vocs.filter((row) => row.worker_id === worker.id);
    const entries = hydrateCardsVocsFromWorker(worker, workerVocs);
    const nextEntries = entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        expiry_date: expiryDate,
        document_url: input.documentUrl ?? entry.document_url,
      };
    });

    return updateWorker(worker.id, {
      cards_vocs: serializeCardsVocs(nextEntries),
    });
  }

  return { error: "Unsupported alert type." };
}

export const COMPLIANCE_ALERT_FILTER_OPTIONS: Array<{
  id: ComplianceAlertFilter;
  label: string;
  description: string;
}> = [
  {
    id: "all",
    label: "All Alerts",
    description: "Every active and upcoming compliance alert.",
  },
  {
    id: "heavy_vehicle_check",
    label: "Heavy Vehicle Checks",
    description: `Triggers ${HEAVY_VEHICLE_ALERT_WINDOW_DAYS} days (8 weeks) before due date.`,
  },
  {
    id: "fleet_plant_registration",
    label: "Fleet & Plant Registrations",
    description: `Triggers ${FLEET_PLANT_REGISTRATION_ALERT_WINDOW_DAYS} days before expiry.`,
  },
  {
    id: "worker_ticket",
    label: "Worker Tickets & Licenses",
    description: `Triggers ${WORKER_TICKET_ALERT_WINDOW_DAYS} days before expiry.`,
  },
  {
    id: "company_insurance",
    label: "Company Insurances",
    description: `Triggers ${COMPANY_INSURANCE_ALERT_WINDOW_DAYS} days before expiry (includes expired).`,
  },
];
