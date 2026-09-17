"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import {
  resolvePlantAssignedProjectId,
  resolvePlantAssignedProjectName,
} from "@/lib/project-assignments";
import { resolvePlantServiceDisplayName } from "@/lib/plant-services";
import { formatPlantCalendarDotDate } from "@/components/plant/plant-calendar-events";
import { YARD_PROJECT_LABEL } from "@/components/plant/plant-project-allocations";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

const YARD_VALUE = "__yard__";

interface PlantAssignToProjectModalProps {
  open: boolean;
  plant: PlantAsset[];
  projects: DbProject[];
  initialPlantId: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onAssign: (input: {
    plantId: string;
    projectId: string | null;
    effectiveFrom: string;
  }) => Promise<void> | void;
}

function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function PlantAssignToProjectModal({
  open,
  plant,
  projects,
  initialPlantId,
  saving = false,
  error = null,
  onClose,
  onAssign,
}: PlantAssignToProjectModalProps) {
  const [plantId, setPlantId] = useState(initialPlantId);
  const [targetProjectId, setTargetProjectId] = useState(YARD_VALUE);
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso);
  const [localError, setLocalError] = useState<string | null>(null);

  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);

  const selectedPlant = useMemo(
    () => plant.find((asset) => asset.id === plantId) ?? plant[0] ?? null,
    [plant, plantId]
  );

  const currentProjectName = selectedPlant
    ? resolvePlantAssignedProjectName(selectedPlant)
    : YARD_PROJECT_LABEL;

  const currentProjectLabel =
    !currentProjectName || currentProjectName === "Unassigned"
      ? YARD_PROJECT_LABEL
      : currentProjectName;

  useEffect(() => {
    if (!open) return;
    const nextPlantId = initialPlantId || plant[0]?.id || "";
    const nextPlant = plant.find((asset) => asset.id === nextPlantId) ?? plant[0] ?? null;
    const currentId = nextPlant ? resolvePlantAssignedProjectId(nextPlant) : "";
    setPlantId(nextPlantId);
    setTargetProjectId(currentId || YARD_VALUE);
    setEffectiveFrom(todayIso());
    setLocalError(null);
  }, [initialPlantId, open, plant]);

  if (!open) return null;

  const plantName = resolvePlantServiceDisplayName(selectedPlant ?? undefined);

  const handleAssign = async () => {
    if (!plantId) {
      setLocalError("Select a machine.");
      return;
    }
    if (!effectiveFrom) {
      setLocalError("Effective From Date is required.");
      return;
    }
    setLocalError(null);
    await onAssign({
      plantId,
      projectId: targetProjectId === YARD_VALUE ? null : targetProjectId,
      effectiveFrom,
    });
  };

  return (
    <div className={modalOverlayClass} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={cn(modalShellClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assign to Project</h2>
            <p className="mt-1 text-sm text-slate-500">
              Move plant with an open-ended assignment from a required effective date.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={cn(modalBodyClass, "space-y-4")}>
          <label className="block">
            <span className={labelClass}>Machine</span>
            <select
              className={inputClass}
              value={plantId}
              onChange={(event) => setPlantId(event.target.value)}
              disabled={saving}
            >
              {plant.map((asset) => {
                const assigned = resolvePlantAssignedProjectName(asset);
                const assignedLabel =
                  !assigned || assigned === "Unassigned" ? YARD_PROJECT_LABEL : assigned;
                return (
                  <option key={asset.id} value={asset.id}>
                    {resolvePlantServiceDisplayName(asset)} · {assignedLabel}
                  </option>
                );
              })}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              {plantName} is currently on {currentProjectLabel}.
            </span>
          </label>

          <label className="block">
            <span className={labelClass}>Target Project</span>
            <select
              className={inputClass}
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
              disabled={saving}
            >
              <option value={YARD_VALUE}>{YARD_PROJECT_LABEL}</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className={labelClass}>Effective From Date (required)</span>
            <input
              type="date"
              required
              className={inputClass}
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              disabled={saving}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Format: {formatPlantCalendarDotDate(effectiveFrom || todayIso())} (DD.MM.YYYY)
            </span>
          </label>

          {localError || error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {localError || error}
            </p>
          ) : null}
        </div>

        <div className={cn(modalStickyFooterClass, "flex justify-end gap-2 py-3")}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={saving || !plantId || !effectiveFrom}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign to Project
          </button>
        </div>
      </div>
    </div>
  );
}
