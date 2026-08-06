"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { PlantAsset } from "@/lib/supabase";
import { getPlantAssignedProjectIds } from "@/lib/project-assignments";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AssignPlantPickerModalProps {
  projectId: string;
  projectName: string;
  plant: PlantAsset[];
  assignedPlantIds: string[];
  plantProjectMap: Map<string, string[]>;
  onClose: () => void;
  onAssign: (plantIds: string[]) => Promise<{ error: string | null }>;
}

export default function AssignPlantPickerModal({
  projectName,
  plant,
  assignedPlantIds,
  plantProjectMap,
  onClose,
  onAssign,
}: AssignPlantPickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availablePlant = useMemo(() => {
    const assigned = new Set(assignedPlantIds);
    return plant.filter((asset) => {
      if (assigned.has(asset.id)) return false;
      const projectIds = getPlantAssignedProjectIds(
        asset,
        plantProjectMap.get(asset.id) ?? []
      );
      return !projectIds.length || true;
    });
  }, [plant, assignedPlantIds, plantProjectMap]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availablePlant;
    return availablePlant.filter(
      (asset) =>
        asset.unit_number.toLowerCase().includes(q) ||
        asset.category.toLowerCase().includes(q) ||
        (asset.make ?? "").toLowerCase().includes(q) ||
        (asset.model ?? "").toLowerCase().includes(q)
    );
  }, [availablePlant, query]);

  const toggle = (plantId: string) => {
    setSelectedIds((prev) =>
      prev.includes(plantId) ? prev.filter((id) => id !== plantId) : [...prev, plantId]
    );
  };

  const handleAssign = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    setError(null);
    const { error: assignError } = await onAssign(selectedIds);
    setSaving(false);
    if (assignError) {
      setError(assignError);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={cn("w-full max-w-lg p-6", cardClass)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assign Plant to Project</h2>
            <p className="mt-1 text-sm text-slate-500">
              Select equipment from the organisation master list for{" "}
              <span className="font-semibold text-slate-700">{projectName}</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search unit, category, make…"
          className={cn(inputClass, "mb-3")}
        />

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-slate-500">
              No available plant found. Register equipment under Organisation → Plant.
            </p>
          ) : (
            filtered.map((asset) => (
              <label
                key={asset.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(asset.id)}
                  onChange={() => toggle(asset.id)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    {asset.unit_number}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {asset.category}
                    {asset.make ? ` · ${asset.make}` : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleAssign()}
            disabled={saving || selectedIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign Selected
          </button>
        </div>
      </div>
    </div>
  );
}
