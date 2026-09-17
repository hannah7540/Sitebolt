"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Worker } from "@/lib/supabase";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import SearchableWorkerPicker from "@/components/communications/SearchableWorkerPicker";
import {
  COMM_STATE_FILTER_OPTIONS,
  COMMS_TARGET_MODE_LABELS,
  COMMS_TARGET_MODE_ORDER,
  eligibleCommsWorkers,
  formatCommsRecipientPreview,
  type CommsTargetMode,
  type ProjectStateTag,
} from "@/components/communications/recipient-targeting";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface RecipientTargetingControlsProps {
  mode: CommsTargetMode | "custom_emails";
  onModeChange: (mode: CommsTargetMode) => void;
  selectedStateTags: ProjectStateTag[];
  onStateTagsChange: (tags: ProjectStateTag[]) => void;
  selectedProjectIds: string[];
  onProjectIdsChange: (ids: string[]) => void;
  selectedWorkerIds?: string[];
  onWorkerIdsChange?: (ids: string[]) => void;
  workers?: Worker[];
  channel?: "sms" | "email";
  projects: DbProject[];
  recipients: Worker[];
  extraModeSlot?: ReactNode;
}

export default function RecipientTargetingControls({
  mode,
  onModeChange,
  selectedStateTags,
  onStateTagsChange,
  selectedProjectIds,
  onProjectIdsChange,
  selectedWorkerIds = [],
  onWorkerIdsChange,
  workers = [],
  channel = "email",
  projects,
  recipients,
  extraModeSlot,
}: RecipientTargetingControlsProps) {
  const [projectSearch, setProjectSearch] = useState("");

  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const pickerWorkers = useMemo(
    () => eligibleCommsWorkers(workers, channel),
    [channel, workers]
  );

  const filteredProjects = useMemo(() => {
    const needle = projectSearch.trim().toLowerCase();
    if (!needle) return activeProjects;
    return activeProjects.filter((project) => {
      const haystack = `${project.name} ${project.project_code ?? ""} ${project.location ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [activeProjects, projectSearch]);

  const selectedState = selectedStateTags[0] ?? "";

  const toggleProject = (id: string) => {
    onProjectIdsChange(
      selectedProjectIds.includes(id)
        ? selectedProjectIds.filter((item) => item !== id)
        : [...selectedProjectIds, id]
    );
  };

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className={labelClass}>Recipient targeting *</legend>
        <div className="flex flex-wrap gap-2">
          {COMMS_TARGET_MODE_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onModeChange(item)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                mode === item
                  ? "border-orange-300 bg-orange-500 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {COMMS_TARGET_MODE_LABELS[item]}
            </button>
          ))}
          {extraModeSlot}
        </div>
      </fieldset>

      {mode === "by_state" ? (
        <label className="block space-y-1">
          <span className={labelClass}>Filter by State</span>
          <select
            className={inputClass}
            value={selectedState}
            onChange={(event) => {
              const next = event.target.value as ProjectStateTag | "";
              onStateTagsChange(
                next && (COMM_STATE_FILTER_OPTIONS as readonly string[]).includes(next)
                  ? [next as ProjectStateTag]
                  : []
              );
            }}
          >
            <option value="">Select state</option>
            {COMM_STATE_FILTER_OPTIONS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {mode === "by_project" ? (
        <div className="space-y-2">
          <p className={labelClass}>Active projects</p>
          <input
            className={inputClass}
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            placeholder="Search projects…"
          />
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {filteredProjects.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">No matching projects.</p>
            ) : (
              filteredProjects.map((project) => (
                <label
                  key={project.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}

      {mode === "selected_workers" && onWorkerIdsChange ? (
        <SearchableWorkerPicker
          workers={pickerWorkers}
          selectedIds={selectedWorkerIds}
          onChange={onWorkerIdsChange}
          contactKind={channel === "sms" ? "mobile" : "email"}
        />
      ) : null}

      {mode === "custom_emails" ? null : (
        <p className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800">
          {formatCommsRecipientPreview(recipients)}
        </p>
      )}
    </div>
  );
}
