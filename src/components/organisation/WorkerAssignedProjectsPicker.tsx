"use client";

import { useMemo } from "react";
import AutocompleteField from "@/components/ui/AutocompleteField";
import type { DbProject } from "@/lib/project-resolver";

interface WorkerAssignedProjectsPickerProps {
  projects: DbProject[];
  selectedIds: string[];
  onChange: (projectIds: string[]) => void;
  disabled?: boolean;
  saving?: boolean;
}

export default function WorkerAssignedProjectsPicker({
  projects,
  selectedIds,
  onChange,
  disabled = false,
  saving = false,
}: WorkerAssignedProjectsPickerProps) {
  const options = useMemo(
    () =>
      [...projects]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((project) => ({
          id: project.id,
          label: project.name,
        })),
    [projects]
  );

  const allSelected =
    projects.length > 0 && projects.every((project) => selectedIds.includes(project.id));

  return (
    <div className="min-w-[12rem] space-y-1">
      {projects.length > 0 ? (
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() =>
            onChange(allSelected ? [] : options.map((option) => option.id))
          }
          className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
        >
          {allSelected ? "Clear all" : "Select all projects"}
        </button>
      ) : null}
      <AutocompleteField
        mode="multiple"
        options={options}
        selected={selectedIds}
        onChange={onChange}
        disabled={disabled || saving}
        placeholder="Search projects…"
        emptyMessage="No active projects."
        noMatchesMessage="No projects match your search."
      />
    </div>
  );
}
