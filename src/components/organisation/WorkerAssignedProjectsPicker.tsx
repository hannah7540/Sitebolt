"use client";

import { useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import DropdownPanel from "@/components/ui/DropdownPanel";
import type { DbProject } from "@/lib/project-resolver";
import { cn } from "@/lib/utils";
import { inputClass } from "@/lib/ui-classes";

interface WorkerAssignedProjectsPickerProps {
  projects: DbProject[];
  selectedIds: string[];
  onChange: (projectIds: string[]) => void;
  disabled?: boolean;
  saving?: boolean;
}

function ProjectBadges({
  projects,
  selectedIds,
}: {
  projects: DbProject[];
  selectedIds: string[];
}) {
  const selected = projects.filter((p) => selectedIds.includes(p.id));

  if (selected.length === 0) {
    return <span className="text-xs text-slate-400">No projects assigned</span>;
  }

  const visible = selected.slice(0, 2);
  const extra = selected.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((project) => (
        <span
          key={project.id}
          className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-800"
        >
          {project.name}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[11px] font-medium text-slate-500">+{extra} more</span>
      )}
    </div>
  );
}

export default function WorkerAssignedProjectsPicker({
  projects,
  selectedIds,
  onChange,
  disabled = false,
  saving = false,
}: WorkerAssignedProjectsPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const allSelected =
    projects.length > 0 && projects.every((p) => selectedIds.includes(p.id));

  const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));

  const toggleProject = (projectId: string) => {
    onChange(
      selectedIds.includes(projectId)
        ? selectedIds.filter((id) => id !== projectId)
        : [...selectedIds, projectId]
    );
  };

  const toggleAll = () => {
    onChange(allSelected ? [] : sortedProjects.map((p) => p.id));
  };

  return (
    <div className="min-w-[12rem]">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || saving}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          inputClass,
          "flex min-h-[2.25rem] w-full items-center justify-between gap-2 py-1.5 text-left"
        )}
      >
        <span className="min-w-0 flex-1">
          <ProjectBadges projects={projects} selectedIds={selectedIds} />
        </span>
        {saving ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-500" />
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-slate-400 transition",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      <DropdownPanel
        open={open}
        triggerRef={triggerRef}
        minWidth={288}
        matchTriggerWidth={false}
        maxHeight={280}
        onClose={() => setOpen(false)}
        className="p-2"
      >
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-900">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />
          Select All / All Projects
        </label>

        <div className="mt-2 max-h-52 space-y-0.5 overflow-y-auto" role="listbox">
          {sortedProjects.length === 0 ? (
            <p className="px-2 py-3 text-xs text-slate-500">No active projects.</p>
          ) : (
            sortedProjects.map((project) => (
              <label
                key={project.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(project.id)}
                  onChange={() => toggleProject(project.id)}
                  className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="truncate">{project.name}</span>
              </label>
            ))
          )}
        </div>
      </DropdownPanel>
    </div>
  );
}
