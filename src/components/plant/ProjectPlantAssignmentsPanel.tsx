"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Plus, Trash2, Truck, Search, X } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";
import {
  assignPlantToProjectBatch,
  filterPlantForProject,
  loadAssignmentMaps,
  unassignPlantFromProject,
} from "@/lib/project-assignments";
import { fetchProjects } from "@/lib/project-resolver";
import { getServiceWarning, isTaggedOut } from "@/lib/plant-utils";
import AssignPlantPickerModal from "./AssignPlantPickerModal";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ProjectPlantAssignmentsPanelProps {
  projectId: string | null;
  projectName: string;
  plant: PlantAsset[];
  loading: boolean;
  onRefresh: () => void;
}

export default function ProjectPlantAssignmentsPanel({
  projectId,
  projectName,
  plant,
  loading,
  onRefresh,
}: ProjectPlantAssignmentsPanelProps) {
  const [plantProjectMap, setPlantProjectMap] = useState<Map<string, string[]>>(new Map());
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    await fetchProjects();
    const { plantByProject } = await loadAssignmentMaps();
    setPlantProjectMap(plantByProject);
    setAssignmentsLoading(false);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments, plant.length]);

  const assignedPlant = useMemo(() => {
    if (!projectId) return [];
    return filterPlantForProject(plant, projectId, plantProjectMap);
  }, [plant, projectId, plantProjectMap]);

  const filteredAssignedPlant = useMemo(() => {
    if (!searchQuery.trim()) return assignedPlant;

    const q = searchQuery.toLowerCase().trim();

    return assignedPlant.filter((item) => {
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
  }, [assignedPlant, searchQuery]);

  const handleUnassign = async (plantRecord: PlantAsset) => {
    if (!projectId) return;
    setActionId(plantRecord.id);
    const { error } = await unassignPlantFromProject(plantRecord, projectId);
    setActionId(null);
    if (error) {
      alert(error);
      return;
    }
    await loadAssignments();
    onRefresh();
  };

  const handleAssign = async (plantIds: string[]) => {
    if (!projectId || plantIds.length === 0) return { error: null };
    const { error } = await assignPlantToProjectBatch(projectId, plantIds, plant);
    if (!error) {
      await loadAssignments();
      onRefresh();
    }
    return { error };
  };

  if (!projectId) {
    return (
      <p className="text-sm text-slate-500">
        Select a project from the sidebar to manage plant assignments.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">Project Plant</h1>
          <p className="text-sm text-slate-500">
            Plant assigned to <span className="font-semibold text-slate-700">{projectName}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-4 w-4" />
          Assign Plant to Project
        </button>
      </div>

      {(loading || assignmentsLoading) && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading plant assignments…
        </div>
      )}

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assigned plant by Unit #, Name, Make, Model, or Serial #..."
          className={cn(inputClass, "w-full py-2.5 pl-10", searchQuery ? "pr-10" : "pr-4")}
          aria-label="Search assigned plant"
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

      <div className="space-y-4">
        {filteredAssignedPlant.map((asset) => {
          const taggedOut = isTaggedOut(asset);
          const serviceWarning = getServiceWarning(asset);

          return (
            <article key={asset.id} className={cn("p-5", cardClass)}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-orange-500" />
                    <h2 className="text-lg font-semibold text-slate-900">{asset.unit_number}</h2>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {asset.category}
                    {asset.make ? ` · ${asset.make}` : ""}
                    {asset.model ? ` ${asset.model}` : ""}
                  </p>
                  {taggedOut ? (
                    <span className="mt-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                      Tagged Out
                    </span>
                  ) : serviceWarning !== "none" ? (
                    <span className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {serviceWarning === "overdue" ? "Service Overdue" : "Service Due Soon"}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={actionId === asset.id}
                  onClick={() => void handleUnassign(asset)}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {actionId === asset.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Remove from Project
                </button>
              </div>
            </article>
          );
        })}

        {filteredAssignedPlant.length === 0 && !loading && !assignmentsLoading && searchQuery.trim() ? (
          <div className={cn("p-8 text-center", cardClass)}>
            <p className="text-sm text-slate-600">
              No assigned plant matches &quot;{searchQuery.trim()}&quot;.
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

        {!loading && !assignmentsLoading && assignedPlant.length === 0 && !searchQuery.trim() ? (
          <div className={cn("p-8 text-center", cardClass)}>
            <Link2 className="mx-auto h-8 w-8 text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">
              No plant assigned to this project yet. Use Organisation → Plant to register
              equipment, then assign it here.
            </p>
          </div>
        ) : null}
      </div>

      {showPicker && (
        <AssignPlantPickerModal
          projectId={projectId}
          projectName={projectName}
          plant={plant}
          assignedPlantIds={assignedPlant.map((row) => row.id)}
          plantProjectMap={plantProjectMap}
          onClose={() => setShowPicker(false)}
          onAssign={handleAssign}
        />
      )}
    </div>
  );
}
