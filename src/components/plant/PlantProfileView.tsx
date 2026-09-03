"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Loader2,
  Save,
  Truck,
  X,
} from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import {
  fetchPlantPrestarts,
  updatePlant,
} from "@/lib/supabase";
import {
  resolvePlantAssignedProjectName,
  setPlantProjectAssignments,
} from "@/lib/project-assignments";
import {
  hydratePlantDocumentsFromLegacy,
  getPlantPrestartStatusLabel,
  getPlantStatusLabel,
  normalizePlantStatus,
  PLANT_OWNERSHIP_OPTIONS,
  PLANT_STATUS_OPTIONS,
  serializePlantDocuments,
  type PlantDocumentRecord,
} from "@/lib/plant-documents";
import { serializePlantCategories } from "@/lib/plant-categories";
import {
  buildRegisterPlantAssetPayload,
  hasHeavyVehicleFormErrors,
  validateHeavyVehicleFormFields,
  type HeavyVehicleFormErrors,
} from "@/lib/plant-register-payload";
import { getProjectName } from "@/lib/projects";
import {
  PRESTART_TEMPLATES,
  type PrestartTemplate,
} from "@/lib/prestart-templates";
import { isTaggedOut } from "@/lib/plant-utils";
import PlantDocumentsEditor from "@/components/plant/PlantDocumentsEditor";
import PlantEquipmentFields, {
  plantFormValuesFromAsset,
  parsePlantFormNumbers,
  type PlantFormValues,
} from "@/components/plant/PlantEquipmentFields";
import PlantPhotoEditModal from "@/components/plant/PlantPhotoEditModal";
import PlantServiceHistoryTab from "@/components/plant/PlantServiceHistoryTab";
import {
  fetchActiveWorkersForPlantAssignment,
  resolvePlantWorkerOptionLabel,
  syncPlantWorkerAssignment,
} from "@/lib/plant-worker-assignment";
import type { Worker } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, sectionClass } from "@/lib/ui-classes";

type ProfileTab = "basic" | "prestarts" | "documentation" | "service-history";

const TAB_ITEMS: Array<{ id: ProfileTab; label: string }> = [
  { id: "basic", label: "Basic Information" },
  { id: "prestarts", label: "Pre-Starts" },
  { id: "service-history", label: "Service History" },
  { id: "documentation", label: "Documentation" },
];

interface PlantProfileViewProps {
  plant: PlantAsset;
  projects: DbProject[];
  plantProjectIds: string[];
  initialTab?: ProfileTab;
  onBack: () => void;
  onPlantUpdated: (plant: PlantAsset) => void;
}

function PlantAssignmentBadge({
  plant,
  projectIds,
  projects,
}: {
  plant: PlantAsset;
  projectIds: string[];
  projects: DbProject[];
}) {
  const assigned = projects.filter((project) => projectIds.includes(project.id));
  const label =
    assigned.length > 0
      ? assigned.map((project) => project.name).join(", ")
      : resolvePlantAssignedProjectName(plant);

  const isAssigned = assigned.length > 0 || label !== "Unassigned";

  return (
    <span
      className={cn(
        "rounded px-2.5 py-1 text-xs font-bold",
        isAssigned ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-600"
      )}
    >
      {isAssigned ? `Assigned: ${label}` : "Unassigned"}
    </span>
  );
}

export default function PlantProfileView({
  plant,
  projects,
  plantProjectIds,
  initialTab = "basic",
  onBack,
  onPlantUpdated,
}: PlantProfileViewProps) {
  const [currentPlant, setCurrentPlant] = useState(plant);
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [projectIds, setProjectIds] = useState(plantProjectIds);

  useEffect(() => {
    setCurrentPlant(plant);
    setProjectIds(plantProjectIds);
  }, [plant, plantProjectIds]);

  const patchPlant = (updated: PlantAsset) => {
    setCurrentPlant(updated);
    onPlantUpdated(updated);
  };

  const machineryName =
    currentPlant.name?.trim() ||
    [currentPlant.make, currentPlant.model].filter(Boolean).join(" ") ||
    currentPlant.category;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-orange-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to plant registry
      </button>

      <div className="mb-6 flex flex-wrap items-start gap-4">
        <button
          type="button"
          onClick={() => setShowPhotoModal(true)}
          className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-orange-200 bg-orange-50 transition hover:border-orange-400"
          aria-label="Edit plant photo"
        >
          {currentPlant.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPlant.photo_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Truck className="h-10 w-10 text-orange-400" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{currentPlant.unit_number}</h1>
            <span
              className={cn(
                "rounded px-2.5 py-1 text-xs font-bold",
                isTaggedOut(currentPlant)
                  ? "bg-red-100 text-red-800"
                  : normalizePlantStatus(currentPlant.status) === "maintenance"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
              )}
            >
              {getPlantStatusLabel(currentPlant.status)}
            </span>
            <PlantAssignmentBadge
              plant={currentPlant}
              projectIds={projectIds}
              projects={projects}
            />
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{machineryName}</p>
          <p className="mt-1 text-sm text-slate-600">
            {[currentPlant.make, currentPlant.model].filter(Boolean).join(" ") || "—"}
            {currentPlant.category ? ` · ${currentPlant.category}` : ""}
          </p>
          {currentPlant.serial_number ? (
            <p className="mt-1 text-sm text-slate-500">
              Serial / VIN: {currentPlant.serial_number}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium transition",
              tab === item.id
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-orange-50 hover:text-orange-600"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "basic" ? (
        <BasicInfoTab
          plant={currentPlant}
          projects={projects}
          projectIds={projectIds}
          onProjectIdsChange={setProjectIds}
          onSaved={patchPlant}
        />
      ) : tab === "prestarts" ? (
        <PrestartsTab plant={currentPlant} />
      ) : tab === "service-history" ? (
        <PlantServiceHistoryTab plantId={currentPlant.id} />
      ) : (
        <DocumentationTab plant={currentPlant} onSaved={patchPlant} />
      )}

      {showPhotoModal && (
        <PlantPhotoEditModal
          plantId={currentPlant.id}
          currentPhotoUrl={currentPlant.photo_url}
          onClose={() => setShowPhotoModal(false)}
          onPhotoUpdated={(photoUrl) => {
            patchPlant({ ...currentPlant, photo_url: photoUrl });
          }}
        />
      )}
    </div>
  );
}

function BasicInfoTab({
  plant,
  projects,
  projectIds,
  onProjectIdsChange,
  onSaved,
}: {
  plant: PlantAsset;
  projects: DbProject[];
  projectIds: string[];
  onProjectIdsChange: (ids: string[]) => void;
  onSaved: (plant: PlantAsset) => void;
}) {
  const initialAssignedWorkerId = plant.assigned_worker_id ?? null;
  const [values, setValues] = useState<PlantFormValues>(() =>
    plantFormValuesFromAsset(plant, undefined, projectIds[0] ?? null)
  );
  const [name, setName] = useState(plant.name ?? "");
  const [registrationCode, setRegistrationCode] = useState(plant.registration_code ?? "");
  const [hourlyCostRate, setHourlyCostRate] = useState(
    plant.hourly_cost_rate != null ? String(plant.hourly_cost_rate) : ""
  );
  const [ownershipType, setOwnershipType] = useState(plant.ownership_type ?? "company");
  const [status, setStatus] = useState(normalizePlantStatus(plant.status));
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingRegistration, setUploadingRegistration] = useState(false);
  const [heavyVehicleErrors, setHeavyVehicleErrors] =
    useState<HeavyVehicleFormErrors>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingWorkers(true);
      const rows = await fetchActiveWorkersForPlantAssignment();
      if (!cancelled) {
        setWorkers(rows);
        setLoadingWorkers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setValues(plantFormValuesFromAsset(plant, undefined, projectIds[0] ?? null));
    setName(plant.name ?? "");
    setRegistrationCode(plant.registration_code ?? "");
    setHourlyCostRate(plant.hourly_cost_rate != null ? String(plant.hourly_cost_rate) : "");
    setOwnershipType(plant.ownership_type ?? "company");
    setStatus(normalizePlantStatus(plant.status));
    setHeavyVehicleErrors({});
  }, [plant]);

  const setField = <K extends keyof PlantFormValues>(
    key: K,
    value: PlantFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === "projectId") {
      onProjectIdsChange(value ? [String(value)] : []);
    }
  };

  const workerOptions = useMemo(() => {
    const active = [...workers];
    if (
      values.assignedWorkerId &&
      !active.some((worker) => worker.id === values.assignedWorkerId)
    ) {
      active.unshift({
        id: values.assignedWorkerId,
        first_name: plant.assigned_worker_name?.split(" ")[0] ?? "",
        last_name: plant.assigned_worker_name?.split(" ").slice(1).join(" ") ?? "",
        full_name: plant.assigned_worker_name ?? "",
        email: "",
        is_revoked: false,
        is_archived: false,
      } as Worker);
    }
    return active;
  }, [plant.assigned_worker_name, values.assignedWorkerId, workers]);

  const handleSave = async () => {
    const category = serializePlantCategories(values.categories);
    if (!values.unitNumber.trim() || !category) {
      setError("Unit number and at least one category are required.");
      return;
    }

    const parsedNumbers = parsePlantFormNumbers(values);
    if (parsedNumbers.error) {
      setError(parsedNumbers.error);
      return;
    }

    const hvErrors = validateHeavyVehicleFormFields(values);
    setHeavyVehicleErrors(hvErrors);
    if (hasHeavyVehicleFormErrors(hvErrors)) {
      setError("Please complete all required heavy vehicle fields.");
      return;
    }

    if (uploadingRegistration) {
      setError("Please wait for the registration document to finish uploading.");
      return;
    }

    const parsedRate = hourlyCostRate.trim() ? Number(hourlyCostRate) : null;
    if (hourlyCostRate.trim() && Number.isNaN(parsedRate)) {
      setError("Hourly cost rate must be a valid number.");
      return;
    }

    setSaving(true);
    setError(null);

    const mapped = buildRegisterPlantAssetPayload(values);
    const { error: updateError } = await updatePlant(plant.id, {
      ...mapped,
      name: name.trim() || null,
      registration_code: registrationCode.trim() || null,
      hourly_cost_rate: parsedRate,
      ownership_type: ownershipType,
      status,
    });

    if (updateError) {
      setSaving(false);
      setError(updateError);
      return;
    }

    const selectedWorker = workerOptions.find(
      (worker) => worker.id === mapped.assigned_worker_id
    );
    const syncResult = await syncPlantWorkerAssignment({
      plantId: plant.id,
      previousWorkerId: initialAssignedWorkerId,
      nextWorkerId: mapped.assigned_worker_id,
      nextWorkerName: selectedWorker
        ? resolvePlantWorkerOptionLabel(selectedWorker)
        : null,
    });

    if (syncResult.error) {
      setSaving(false);
      setError(syncResult.error);
      return;
    }

    const nextProjectIds = mapped.project_id ? [mapped.project_id] : [];
    const { error: assignError } = await setPlantProjectAssignments(plant, nextProjectIds);
    onProjectIdsChange(nextProjectIds);
    setSaving(false);

    if (assignError) {
      setError(assignError);
      return;
    }

    onSaved({
      ...plant,
      unit_number: mapped.unit_number,
      category: mapped.category,
      make: mapped.make,
      model: mapped.model,
      serial_number: mapped.serial_number,
      current_hours: mapped.current_hours,
      next_service_hours: mapped.next_service_hours,
      service_contact_company: mapped.service_contact_company,
      service_contact_name: mapped.service_contact_name,
      service_contact_phone: mapped.service_contact_phone,
      service_contact_email: mapped.service_contact_email,
      heavy_vehicle_check_required: mapped.heavy_vehicle_check_required,
      last_heavy_vehicle_check_date: mapped.last_heavy_vehicle_check_date,
      next_heavy_vehicle_check_due_date: mapped.next_heavy_vehicle_check_due_date,
      heavy_vehicle_last_completed_date: mapped.heavy_vehicle_last_completed_date,
      heavy_vehicle_next_due_date: mapped.heavy_vehicle_next_due_date,
      registration_expiry_date: mapped.registration_expiry_date,
      registration_document_url: mapped.registration_document_url,
      name: name.trim() || null,
      registration_code: registrationCode.trim() || null,
      hourly_cost_rate: parsedRate,
      ownership_type: ownershipType,
      status,
      prestart_template:
        (mapped.prestart_template as PrestartTemplate | null) ??
        values.prestartTemplate,
      assigned_worker_id: mapped.assigned_worker_id,
      assigned_worker_name: selectedWorker
        ? resolvePlantWorkerOptionLabel(selectedWorker)
        : null,
      project_id: mapped.project_id,
      assigned_project_id: mapped.project_id,
      current_project_id: mapped.project_id,
    });
  };

  return (
    <div className={cn(sectionClass, "space-y-4")}>
      <p className="text-sm text-slate-500">
        Update registry details, ownership, operational status, and project assignment.
      </p>

      <PlantEquipmentFields
        values={values}
        onChange={setField}
        workers={workerOptions}
        projects={projects}
        loadingWorkers={loadingWorkers}
        disabled={saving}
        fieldErrors={heavyVehicleErrors}
        onFieldErrorChange={setHeavyVehicleErrors}
        onUploadingChange={setUploadingRegistration}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className={labelClass}>Machinery name</span>
          <input
            className={inputClass}
            value={name ?? ""}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Registration / plant code</span>
          <input
            className={inputClass}
            value={registrationCode ?? ""}
            onChange={(e) => setRegistrationCode(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Hourly cost rate ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputClass}
            value={hourlyCostRate ?? ""}
            onChange={(e) => setHourlyCostRate(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Ownership type</span>
          <select
            className={inputClass}
            value={ownershipType ?? "company"}
            onChange={(e) => setOwnershipType(e.target.value)}
            disabled={saving}
          >
            {PLANT_OWNERSHIP_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={labelClass}>Current status</span>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            disabled={saving}
          >
            {PLANT_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={saving || uploadingRegistration}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save basic information
      </button>
    </div>
  );
}

function PrestartsTab({ plant }: { plant: PlantAsset }) {
  const [prestarts, setPrestarts] = useState<PlantPrestart[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlantPrestart | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlantPrestarts({ plantIds: [plant.id], limit: 200 }).then((rows) => {
      if (!cancelled) {
        setPrestarts(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plant.id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading pre-start history…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Worker-submitted pre-start inspection logs for this plant asset.
      </p>

      {prestarts.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No pre-start checklists recorded for this plant yet.
        </p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-orange-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Date / time</th>
                <th className="px-4 py-3">Worker</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {prestarts.map((row) => {
                const statusLabel = getPlantPrestartStatusLabel(row);
                const badgeClass =
                  statusLabel === "Passed"
                    ? "bg-emerald-100 text-emerald-800"
                    : statusLabel === "Out of Service"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800";

                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-orange-50/40"
                    onClick={() => setSelected(row)}
                  >
                    <td className="px-4 py-3 text-slate-700">
                      {new Date(row.created_at).toLocaleString("en-AU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.operator_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {getProjectName(row.project_id) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded px-2 py-0.5 text-xs font-bold", badgeClass)}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      {row.defect_comments ? (
                        <span className="line-clamp-2">{row.defect_comments}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <PrestartChecklistModal
          prestart={selected}
          plant={plant}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function PrestartChecklistModal({
  prestart,
  plant,
  onClose,
}: {
  prestart: PlantPrestart;
  plant: PlantAsset;
  onClose: () => void;
}) {
  const template = (plant.prestart_template ?? "excavator") as PrestartTemplate;
  const fields = PRESTART_TEMPLATES[template] ?? [];
  const checkData = prestart.check_data ?? {};
  const statusLabel = getPlantPrestartStatusLabel(prestart);

  const rows = useMemo(() => {
    const listed = fields
      .filter((field) => field.type !== "section")
      .map((field) => ({
        label: field.label,
        value: checkData[field.key] != null ? String(checkData[field.key]) : "—",
      }));

    const knownKeys = new Set(fields.map((field) => field.key));
    for (const [key, value] of Object.entries(checkData)) {
      if (knownKeys.has(key)) continue;
      listed.push({ label: key.replace(/_/g, " "), value: String(value ?? "—") });
    }

    return listed;
  }, [checkData, fields]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Pre-Start Checklist</h2>
            <p className="text-sm text-slate-500">
              {prestart.operator_name} ·{" "}
              {new Date(prestart.created_at).toLocaleString("en-AU", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className={cn(
              "rounded px-2.5 py-1 text-xs font-bold",
              statusLabel === "Passed"
                ? "bg-emerald-100 text-emerald-800"
                : statusLabel === "Out of Service"
                  ? "bg-red-100 text-red-800"
                  : "bg-amber-100 text-amber-800"
            )}
          >
            {statusLabel}
          </span>
          <span className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {getProjectName(prestart.project_id) ?? "No project"}
          </span>
        </div>

        {prestart.defect_comments ? (
          <div className={cn(sectionClass, "mb-4")}>
            <p className={labelClass}>Notes / defect comments</p>
            <p className="text-sm text-slate-900">{prestart.defect_comments}</p>
          </div>
        ) : null}

        <div className={cn(sectionClass, "space-y-2")}>
          <p className={labelClass}>Checklist items</p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rows.map((row) => (
              <li key={row.label} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                <span className="text-slate-600">{row.label}</span>
                <span className="font-medium text-slate-900">{row.value}</span>
              </li>
            ))}
          </ul>
        </div>

        {prestart.defect_photo_url ? (
          <div className={cn(sectionClass, "mt-4")}>
            <p className={labelClass}>Defect photo</p>
            <div className="relative mt-2 h-48 w-full overflow-hidden rounded-lg border border-slate-200">
              <Image
                src={prestart.defect_photo_url}
                alt="Defect"
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DocumentationTab({
  plant,
  onSaved,
}: {
  plant: PlantAsset;
  onSaved: (plant: PlantAsset) => void;
}) {
  const [documents, setDocuments] = useState<PlantDocumentRecord[]>(() =>
    hydratePlantDocumentsFromLegacy(plant)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDocuments(hydratePlantDocumentsFromLegacy(plant));
  }, [plant]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const serialized = serializePlantDocuments(documents);
    const { error: updateError } = await updatePlant(plant.id, {
      plant_documents: serialized,
    });
    setSaving(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    onSaved({ ...plant, plant_documents: serialized });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Service history, risk assessments, registration, and insurance documents for this plant.
      </p>

      <PlantDocumentsEditor plantId={plant.id} documents={documents} onChange={setDocuments} />

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save documentation
      </button>
    </div>
  );
}
