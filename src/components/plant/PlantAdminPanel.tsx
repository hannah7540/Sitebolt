"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, QrCode, Phone, AlertOctagon, Wrench, Link2, Pencil, Search, X } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";
import { addPlant } from "@/lib/supabase";
import {
  getPlantAssignedProjectIds,
  loadAssignmentMaps,
  resolvePlantAssignedProjectName,
  setPlantProjectAssignments,
} from "@/lib/project-assignments";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import AssignToProjectsModal from "@/components/organisation/AssignToProjectsModal";
import {
  PRESTART_TEMPLATE_LABELS,
  type PrestartTemplate,
} from "@/lib/prestart-templates";
import {
  getServiceMetrics,
  getServiceWarning,
  isTaggedOut,
  formatReading,
} from "@/lib/plant-utils";
import PlantQRModal from "./PlantQRModal";
import PlantDefectModal from "./PlantDefectModal";
import PlantProfileView from "./PlantProfileView";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const TEMPLATES = Object.keys(PRESTART_TEMPLATE_LABELS) as PrestartTemplate[];

type PlantProfileTab = "basic" | "prestarts" | "documentation";

interface PlantAdminPanelProps {
  plant: PlantAsset[];
  loading: boolean;
  onRefresh: () => void;
  initialShowAdd?: boolean;
}

function TagOutBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-red-400 bg-red-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-red-800">
      <AlertOctagon className="h-3.5 w-3.5" />
      Out of Service / Tagged Out
    </span>
  );
}

function ServiceWarningBadge({ plant }: { plant: PlantAsset }) {
  const warning = getServiceWarning(plant);
  if (warning === "none") return null;

  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs font-bold uppercase tracking-wide",
        warning === "overdue"
          ? "bg-red-100 text-red-800"
          : "bg-amber-100 text-amber-800"
      )}
    >
      {warning === "overdue" ? "Service Overdue" : "Service Due Soon"}
    </span>
  );
}

function AvailableBadge() {
  return (
    <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">
      Available
    </span>
  );
}

export default function PlantAdminPanel({
  plant,
  loading,
  onRefresh,
  initialShowAdd = false,
}: PlantAdminPanelProps) {
  const [showAddPlant, setShowAddPlant] = useState(initialShowAdd);
  const [unitNumber, setUnitNumber] = useState("");
  const [category, setCategory] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [servicePhone, setServicePhone] = useState("");
  const [newTemplate, setNewTemplate] = useState<PrestartTemplate>("excavator");
  const [qrPlant, setQrPlant] = useState<PlantAsset | null>(null);
  const [defectPlant, setDefectPlant] = useState<PlantAsset | null>(null);
  const [assignPlant, setAssignPlant] = useState<PlantAsset | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<PlantAsset | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<PlantProfileTab>("basic");
  const [plantList, setPlantList] = useState<PlantAsset[]>(plant);
  const [searchQuery, setSearchQuery] = useState("");
  const [plantProjectMap, setPlantProjectMap] = useState<Map<string, string[]>>(new Map());
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());

  useEffect(() => {
    setPlantList(plant);
  }, [plant]);

  const patchPlant = useCallback(
    (updated: PlantAsset) => {
      setPlantList((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setSelectedPlant((current) => (current?.id === updated.id ? updated : current));
    },
    []
  );

  const openPlantProfile = (asset: PlantAsset, tab: PlantProfileTab = "basic") => {
    setProfileInitialTab(tab);
    setSelectedPlant(asset);
  };

  const filteredPlantList = useMemo(() => {
    if (!searchQuery.trim()) return plantList;

    const q = searchQuery.toLowerCase().trim();

    return plantList.filter((item) => {
      const plantNum = (item.plant_number || item.unit_number || "").toLowerCase();
      const name = (item.name || "").toLowerCase();
      const make = (item.make || "").toLowerCase();
      const model = (item.model || "").toLowerCase();
      const serial = (
        item.serial_number ||
        (item as PlantAsset & { vin?: string | null }).vin ||
        ""
      ).toLowerCase();
      const category = (item.category || "").toLowerCase();

      return (
        plantNum.includes(q) ||
        name.includes(q) ||
        make.includes(q) ||
        model.includes(q) ||
        serial.includes(q) ||
        category.includes(q)
      );
    });
  }, [plantList, searchQuery]);

  useEffect(() => {
    void (async () => {
      await fetchProjects();
      setProjects(getCachedProjects());
      const { plantByProject } = await loadAssignmentMaps();
      setPlantProjectMap(plantByProject);
    })();
  }, [plant.length]);

  useEffect(() => {
    if (initialShowAdd) setShowAddPlant(true);
  }, [initialShowAdd]);

  const handleAddPlant = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await addPlant({
      unit_number: unitNumber,
      category,
      make: make || undefined,
      model: model || undefined,
      prestart_template: newTemplate,
      service_contact_name: serviceName || undefined,
      service_contact_phone: servicePhone || undefined,
    });
    if (!error) {
      setUnitNumber("");
      setCategory("");
      setMake("");
      setModel("");
      setServiceName("");
      setServicePhone("");
      setShowAddPlant(false);
      onRefresh();
    } else {
      alert(error);
    }
  };

  if (selectedPlant) {
    return (
      <PlantProfileView
        plant={selectedPlant}
        projects={projects}
        plantProjectIds={getPlantAssignedProjectIds(
          selectedPlant,
          plantProjectMap.get(selectedPlant.id) ?? []
        )}
        initialTab={profileInitialTab}
        onBack={() => setSelectedPlant(null)}
        onPlantUpdated={patchPlant}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">Plant &amp; Machinery</h1>
          <p className="text-sm text-slate-500">
            Organisation master registry · register equipment and assign to projects
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddPlant(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold hover:bg-orange-500"
        >
          <Plus className="h-5 w-5" /> Add Plant
        </button>
      </div>

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by Unit #, Name, Make, Model, Serial #, or Category..."
          className={cn(inputClass, "w-full py-2.5 pl-10", searchQuery ? "pr-10" : "pr-4")}
          aria-label="Search plant assets"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {showAddPlant && (
        <form
          onSubmit={handleAddPlant}
          className={cn("mb-6 max-w-lg space-y-4 p-6", cardClass)}
        >
          <h3 className="text-lg font-bold text-slate-900">Register Plant Asset</h3>
          <input
            type="text"
            placeholder="Unit Number (e.g. EX-01)"
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
            required
            className={inputClass}
          />
          <input
            type="text"
            placeholder="Category (e.g. 8t Excavator)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Make (e.g. Volvo)"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Model (e.g. EC220E)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Service Contact Name"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              className={inputClass}
            />
            <input
              type="tel"
              placeholder="Service Contact Phone"
              value={servicePhone}
              onChange={(e) => setServicePhone(e.target.value)}
              className={inputClass}
            />
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Pre-Start Template</span>
            <select
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value as PrestartTemplate)}
              className={inputClass}
            >
              {TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {PRESTART_TEMPLATE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-orange-600 px-4 py-2 font-bold text-white"
            >
              Save Asset
            </button>
            <button
              type="button"
              onClick={() => setShowAddPlant(false)}
              className="rounded bg-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {filteredPlantList.map((p) => {
          const taggedOut = isTaggedOut(p);
          const metrics = getServiceMetrics(p);
          const assignedProjectIds = getPlantAssignedProjectIds(
            p,
            plantProjectMap.get(p.id) ?? []
          );
          const assignedProjects = projects.filter((project) =>
            assignedProjectIds.includes(project.id)
          );

          return (
            <div
              key={p.id}
              className={cn(
                "cursor-pointer rounded-xl border p-5 transition hover:border-orange-300",
                taggedOut ? "border-red-300 bg-red-50" : cardClass
              )}
              onClick={() => openPlantProfile(p)}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{p.unit_number}</h3>
                  <p className="text-sm text-slate-600">
                    {p.category}
                    {p.make && ` · ${p.make}`}
                    {p.model && ` ${p.model}`}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Current: {formatReading(metrics.current, metrics.unit)}
                    {metrics.next != null &&
                      ` · Next service: ${formatReading(metrics.next, metrics.unit)}`}
                  </p>
                  {p.service_contact_name && p.service_contact_phone && (
                    <a
                      href={`tel:${p.service_contact_phone.replace(/\s/g, "")}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-500"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {p.service_contact_name} · {p.service_contact_phone}
                    </a>
                  )}
                  {assignedProjects.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Assigned:{" "}
                      {assignedProjects.map((project) => project.name).join(", ")}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Assigned: {resolvePlantAssignedProjectName(p)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {taggedOut ? <TagOutBadge /> : <AvailableBadge />}
                  <ServiceWarningBadge plant={p} />
                </div>
              </div>

              <div
                className="mt-4 flex flex-wrap items-end gap-3"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => openPlantProfile(p, "basic")}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>

                {taggedOut ? (
                  <button
                    type="button"
                    onClick={() => setDefectPlant(p)}
                    className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-100 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-200"
                  >
                    <Wrench className="h-4 w-4" />
                    View Defect &amp; Clear Tag-Out
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQrPlant(p)}
                    className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-orange-50"
                  >
                    <QrCode className="h-4 w-4" />
                    Generate / Print QR Code
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAssignPlant(p)}
                  className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-100"
                >
                  <Link2 className="h-4 w-4" />
                  Assign to Project
                </button>
              </div>
            </div>
          );
        })}

        {filteredPlantList.length === 0 && !loading && searchQuery.trim() ? (
          <div className={`py-10 text-center ${cardClass}`}>
            <p className="text-sm text-slate-600">
              No plant assets match &quot;{searchQuery.trim()}&quot;.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
            >
              <X className="h-4 w-4" />
              Clear Search
            </button>
          </div>
        ) : null}

        {plantList.length === 0 && !loading && !searchQuery.trim() ? (
          <p className="py-8 text-center text-slate-500">
            No plant added yet. Click &quot;Add Plant&quot; to register machinery.
          </p>
        ) : null}
      </div>

      {qrPlant && (
        <PlantQRModal plant={qrPlant} onClose={() => setQrPlant(null)} />
      )}

      {defectPlant && (
        <PlantDefectModal
          plant={defectPlant}
          onClose={() => setDefectPlant(null)}
          onCleared={onRefresh}
        />
      )}

      {assignPlant && (
        <AssignToProjectsModal
          title={`Assign ${assignPlant.unit_number} to Projects`}
          subtitle="Select one or more active projects for this plant asset."
          initialProjectIds={getPlantAssignedProjectIds(
            assignPlant,
            plantProjectMap.get(assignPlant.id) ?? []
          )}
          onClose={() => setAssignPlant(null)}
          onSave={async (projectIds) => {
            const { error } = await setPlantProjectAssignments(assignPlant, projectIds);
            if (!error) {
              const { plantByProject } = await loadAssignmentMaps();
              setPlantProjectMap(plantByProject);
              onRefresh();
            }
            return { error };
          }}
        />
      )}
    </div>
  );
}
