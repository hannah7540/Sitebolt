"use client";

import { cn } from "@/lib/utils";
import type { DbProject } from "@/lib/project-resolver";
import { cardClass, labelClass } from "@/lib/ui-classes";

interface ProjectMultiSelectProps {
  projects: DbProject[];
  selectedProjectIds: string[];
  onChange: (projectIds: string[]) => void;
  className?: string;
}

export default function ProjectMultiSelect({
  projects,
  selectedProjectIds,
  onChange,
  className,
}: ProjectMultiSelectProps) {
  const allSelected =
    projects.length > 0 && selectedProjectIds.length === projects.length;

  const toggleProject = (projectId: string) => {
    if (selectedProjectIds.includes(projectId)) {
      onChange(selectedProjectIds.filter((id) => id !== projectId));
      return;
    }
    onChange([...selectedProjectIds, projectId]);
  };

  const selectAll = () => onChange(projects.map((project) => project.id));
  const clearAll = () => onChange([]);

  return (
    <div className={cn(cardClass, "p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={labelClass}>Project filter</p>
          <p className="text-xs text-slate-500">
            Select one or more projects to filter the calendar timeline.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
          >
            Select all
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
          >
            Clear
          </button>
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="text-sm text-slate-500">No active projects available.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {projects.map((project) => {
            const selected = selectedProjectIds.includes(project.id);
            return (
              <label
                key={project.id}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  selected
                    ? "border-orange-300 bg-orange-50 text-orange-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-orange-200"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleProject(project.id)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                {project.name}
              </label>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {allSelected || selectedProjectIds.length === 0
          ? "Showing all projects."
          : `${selectedProjectIds.length} project${selectedProjectIds.length === 1 ? "" : "s"} selected.`}
      </p>
    </div>
  );
}
