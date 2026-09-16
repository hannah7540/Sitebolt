"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Search, X } from "lucide-react";
import Toast from "@/components/ui/Toast";
import FormFillDrawer from "@/components/forms/FormFillDrawer";
import { useFormToast } from "@/hooks/useFormToast";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import { useWorkerHistoryLayer } from "@/hooks/useWorkerHistoryLayer";
import { fetchAssets, getAssetPrimaryLabel, type Asset } from "@/lib/assets";
import {
  fetchCustomFormTemplates,
  insertCustomFormSubmission,
  type CustomFormAnswers,
  type CustomFormEntityType,
  type CustomFormTemplate,
} from "@/lib/custom-forms";
import { fetchOrganizationFleet, type OrganizationFleetVehicle } from "@/lib/organization-fleet";
import type { DbProject } from "@/lib/project-resolver";
import {
  fetchPlantList,
  resolvePlantAssignedProjectId,
  type PlantAsset,
  type Worker,
} from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cn } from "@/lib/utils";
import {
  cardClass,
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface WorkerOtherFormsSectionProps {
  worker: Worker;
  projects: DbProject[];
  defaultProjectId?: string | null;
}

interface BindingState {
  projectId: string;
  plantId: string;
  fleetId: string;
  assetId: string;
}

function templateBadges(template: CustomFormTemplate): string[] {
  const badges: string[] = [];
  if (template.applies_to_projects) badges.push("Project");
  if (template.applies_to_plant) badges.push("Plant");
  if (template.applies_to_fleet) badges.push("Fleet");
  if (template.applies_to_assets) badges.push("Asset");
  if (!badges.length) badges.push("General");
  return badges;
}

function templateNeedsBinding(template: CustomFormTemplate): boolean {
  return (
    template.applies_to_projects ||
    template.applies_to_plant ||
    template.applies_to_fleet ||
    template.applies_to_assets
  );
}

function templateSearchHaystack(template: CustomFormTemplate): string {
  return [
    template.title,
    template.description ?? "",
    template.assignee_role.replace(/_/g, " "),
    ...templateBadges(template),
    ...template.fields.map((field) => field.label),
    ...template.fields.flatMap((field) => field.options),
    ...template.fields.map((field) => field.helpText),
  ]
    .join(" ")
    .toLowerCase();
}

function plantLabel(plant: PlantAsset): string {
  const detail = [plant.make, plant.model, plant.category].filter(Boolean).join(" ");
  return detail ? `${plant.unit_number} · ${detail}` : plant.unit_number;
}

function fleetLabel(vehicle: OrganizationFleetVehicle): string {
  const detail = [vehicle.make, vehicle.model, vehicle.registration]
    .filter(Boolean)
    .join(" ");
  return detail ? `${vehicle.unit_number} · ${detail}` : vehicle.unit_number;
}

function emptyBinding(defaultProjectId: string): BindingState {
  return { projectId: defaultProjectId, plantId: "", fleetId: "", assetId: "" };
}

export default function WorkerOtherFormsSection({
  worker,
  projects,
  defaultProjectId = null,
}: WorkerOtherFormsSectionProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [plants, setPlants] = useState<PlantAsset[]>([]);
  const [fleet, setFleet] = useState<OrganizationFleetVehicle[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [plantQuery, setPlantQuery] = useState("");
  const [fleetQuery, setFleetQuery] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [picking, setPicking] = useState<CustomFormTemplate | null>(null);
  const [filling, setFilling] = useState<CustomFormTemplate | null>(null);
  const [binding, setBinding] = useState<BindingState>(emptyBinding(""));
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fallbackProjectId =
    defaultProjectId || worker.assigned_project_id || projects[0]?.id || "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      const { data, error } = await fetchCustomFormTemplates();
      if (cancelled) return;
      if (error) {
        setLoadError(error);
        setTemplates([]);
      } else {
        setTemplates(data.filter((template) => template.is_active));
      }
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((template) => templateSearchHaystack(template).includes(query));
  }, [search, templates]);

  const filteredPlants = useMemo(() => {
    const query = plantQuery.trim().toLowerCase();
    const active = plants.filter((plant) => !plant.archived_at);
    if (!query) return active;
    return active.filter((plant) => plantLabel(plant).toLowerCase().includes(query));
  }, [plantQuery, plants]);

  const filteredFleet = useMemo(() => {
    const query = fleetQuery.trim().toLowerCase();
    const active = fleet.filter((vehicle) => vehicle.status !== "archived");
    if (!query) return active;
    return active.filter((vehicle) => fleetLabel(vehicle).toLowerCase().includes(query));
  }, [fleet, fleetQuery]);

  const filteredAssets = useMemo(() => {
    const query = assetQuery.trim().toLowerCase();
    if (!query) return assets;
    return assets.filter((asset) =>
      getAssetPrimaryLabel(asset).toLowerCase().includes(query)
    );
  }, [assetQuery, assets]);

  const ensureSelectorsLoaded = useCallback(
    async (template: CustomFormTemplate) => {
      const tasks: Array<Promise<void>> = [];
      if (template.applies_to_plant && plants.length === 0) {
        tasks.push(
          fetchPlantList().then((rows) => {
            setPlants(rows);
          })
        );
      }
      if (template.applies_to_fleet && fleet.length === 0) {
        tasks.push(
          fetchOrganizationFleet().then((rows) => {
            setFleet(rows);
          })
        );
      }
      if (template.applies_to_assets && assets.length === 0) {
        tasks.push(
          fetchAssets().then((rows) => {
            setAssets(rows);
          })
        );
      }
      if (tasks.length) await Promise.all(tasks);
    },
    [assets.length, fleet.length, plants.length]
  );

  const openFill = useCallback((template: CustomFormTemplate, nextBinding: BindingState) => {
    setBinding(nextBinding);
    setFillError(null);
    setPicking(null);
    setFilling(template);
  }, []);

  const handleSelectTemplate = async (template: CustomFormTemplate) => {
    setPickerError(null);
    if (!templateNeedsBinding(template)) {
      openFill(template, emptyBinding(fallbackProjectId));
      return;
    }
    await ensureSelectorsLoaded(template);
    setPlantQuery("");
    setFleetQuery("");
    setAssetQuery("");
    setBinding(emptyBinding(fallbackProjectId));
    setPicking(template);
  };

  const handlePlantChange = (plantId: string) => {
    const plant = plants.find((item) => item.id === plantId);
    const stampedProject = resolvePlantAssignedProjectId(plant);
    setBinding((current) => ({
      ...current,
      plantId,
      projectId: stampedProject || current.projectId,
    }));
  };

  const handleContinueToForm = () => {
    if (!picking) return;
    if (picking.applies_to_plant && !binding.plantId) {
      setPickerError("Select a plant item for this form.");
      return;
    }
    if (picking.applies_to_fleet && !binding.fleetId) {
      setPickerError("Select a fleet vehicle for this form.");
      return;
    }
    if (picking.applies_to_assets && !binding.assetId) {
      setPickerError("Select an asset for this form.");
      return;
    }
    if (picking.applies_to_projects && !binding.projectId && !binding.plantId) {
      setPickerError("Select a project for this form.");
      return;
    }
    openFill(picking, binding);
  };

  const closePicker = () => {
    setPicking(null);
    setPickerError(null);
  };

  const closeFill = () => {
    setFilling(null);
    setFillError(null);
  };

  const nestedOpen = Boolean(picking || filling);
  const handleNestedBack = useCallback(() => {
    if (filling) {
      closeFill();
      return true;
    }
    if (picking) {
      closePicker();
      return true;
    }
    return false;
  }, [filling, picking]);

  useMobileBackHandler(handleNestedBack, nestedOpen);
  useWorkerHistoryLayer(Boolean(picking), closePicker, "other-forms-pick");
  useWorkerHistoryLayer(Boolean(filling), closeFill, "other-forms-fill");

  const fillEntity = useMemo(() => {
    if (binding.plantId) return { type: "plant" as const, id: binding.plantId };
    if (binding.fleetId) return { type: "fleet" as const, id: binding.fleetId };
    if (binding.assetId) return { type: "asset" as const, id: binding.assetId };
    if (binding.projectId) return { type: "project" as const, id: binding.projectId };
    return { type: "worker" as const, id: worker.id };
  }, [binding, worker.id]);

  const resolvedProjectId = useMemo(() => {
    if (binding.plantId) {
      const plant = plants.find((item) => item.id === binding.plantId);
      return resolvePlantAssignedProjectId(plant) || binding.projectId || null;
    }
    if (binding.fleetId) {
      const vehicle = fleet.find((item) => item.id === binding.fleetId);
      return vehicle?.assigned_project_id || binding.projectId || null;
    }
    if (binding.assetId) {
      const asset = assets.find((item) => item.id === binding.assetId);
      return asset?.project_id || asset?.assigned_project_id || binding.projectId || null;
    }
    return binding.projectId || null;
  }, [assets, binding, fleet, plants]);

  const handleSubmit = async (payload: {
    answers: CustomFormAnswers;
    signatureUrl: string | null;
  }) => {
    if (!filling) return;
    setSaving(true);
    setFillError(null);
    const result = await insertCustomFormSubmission({
      template_id: filling.id,
      template_title: filling.title,
      project_id: resolvedProjectId,
      plant_id: binding.plantId || null,
      worker_id: worker.id,
      fleet_id: binding.fleetId || null,
      asset_id: binding.assetId || null,
      answers: payload.answers,
      submitted_by_name: getWorkerDisplayName(worker, worker.full_name || "Worker"),
      submitted_by_id: worker.id,
      signature_url: payload.signatureUrl,
    });
    setSaving(false);
    if (result.error || !result.data) {
      setFillError(result.error ?? "Submission failed.");
      showError(result.error ?? "Submission failed.");
      return;
    }
    showSuccess(`Submitted ${filling.title}`);
    closeFill();
  };

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-slate-900">Other Forms</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          Search organisation templates and fill them against a project, plant, fleet, or asset.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className={cn(inputClass, "pl-9")}
          placeholder="Search forms (excavator, hume, daily, incident…)"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </div>

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading forms…
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className={cn(cardClass, "p-4 text-sm text-slate-500")}>
          {search.trim()
            ? "No matching organisation forms."
            : "No active organisation form templates yet."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredTemplates.map((template) => (
            <div key={template.id} className={cn(cardClass, "flex flex-col gap-3 p-4")}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{template.title}</p>
                {template.description ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                    {template.description}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1">
                  {templateBadges(template).map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 ring-1 ring-orange-200"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleSelectTemplate(template)}
                className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Fill Form
              </button>
            </div>
          ))}
        </div>
      )}

      {mounted && picking
        ? createPortal(
            <div
              className={modalOverlayClass}
              role="dialog"
              aria-modal="true"
              aria-labelledby="other-form-bind-title"
            >
              <div className={cn(modalShellClass, "max-w-lg")}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
                  <div>
                    <h2 id="other-form-bind-title" className="text-lg font-bold text-slate-900">
                      {picking.title}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Choose where this submission should be filed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePicker}
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className={cn(modalBodyClass, "space-y-4")}>
                  {picking.applies_to_projects ? (
                    <label className="block">
                      <span className={labelClass}>Project</span>
                      <select
                        className={inputClass}
                        value={binding.projectId}
                        onChange={(event) =>
                          setBinding((current) => ({
                            ...current,
                            projectId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select a project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {picking.applies_to_plant ? (
                    <div>
                      <span className={labelClass}>Plant</span>
                      <input
                        className={cn(inputClass, "mt-1 mb-2")}
                        placeholder="Search plant…"
                        value={plantQuery}
                        onChange={(event) => setPlantQuery(event.target.value)}
                      />
                      <select
                        className={inputClass}
                        value={binding.plantId}
                        onChange={(event) => handlePlantChange(event.target.value)}
                      >
                        <option value="">Select a plant item</option>
                        {filteredPlants.map((plant) => (
                          <option key={plant.id} value={plant.id}>
                            {plantLabel(plant)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {picking.applies_to_fleet ? (
                    <div>
                      <span className={labelClass}>Fleet</span>
                      <input
                        className={cn(inputClass, "mt-1 mb-2")}
                        placeholder="Search fleet…"
                        value={fleetQuery}
                        onChange={(event) => setFleetQuery(event.target.value)}
                      />
                      <select
                        className={inputClass}
                        value={binding.fleetId}
                        onChange={(event) =>
                          setBinding((current) => ({
                            ...current,
                            fleetId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select a vehicle</option>
                        {filteredFleet.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>
                            {fleetLabel(vehicle)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {picking.applies_to_assets ? (
                    <div>
                      <span className={labelClass}>Asset</span>
                      <input
                        className={cn(inputClass, "mt-1 mb-2")}
                        placeholder="Search assets…"
                        value={assetQuery}
                        onChange={(event) => setAssetQuery(event.target.value)}
                      />
                      <select
                        className={inputClass}
                        value={binding.assetId}
                        onChange={(event) =>
                          setBinding((current) => ({
                            ...current,
                            assetId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select an asset</option>
                        {filteredAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {getAssetPrimaryLabel(asset)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {pickerError ? (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {pickerError}
                    </p>
                  ) : null}
                </div>
                <div className={cn(modalStickyFooterClass, "flex justify-end gap-2 py-3")}>
                  <button
                    type="button"
                    onClick={closePicker}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueToForm}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <FormFillDrawer
        open={Boolean(filling)}
        template={filling}
        entityType={fillEntity.type as CustomFormEntityType}
        entityId={fillEntity.id}
        projectId={resolvedProjectId}
        saving={saving}
        error={fillError}
        onClose={closeFill}
        onSubmit={handleSubmit}
      />

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </section>
  );
}
