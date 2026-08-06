"use client";

import { useEffect, useState } from "react";
import {
  coerceProjectUuid,
  fetchProjects,
  isProjectUuid,
  type DbProject,
} from "@/lib/project-resolver";
import { inputClass, labelClass } from "@/lib/ui-classes";

const UNASSIGNED_VALUE = "";

interface ProjectSelectProps {
  value: string | null | undefined;
  onChange: (projectId: string | null) => void;
  label?: string;
  /** When true, hides the unassigned option (e.g. timesheets). */
  requireProject?: boolean;
  /** Limit options to these project UUIDs (e.g. worker-granted access). */
  allowedProjectIds?: string[];
}

export default function ProjectSelect({
  value,
  onChange,
  label = "Project",
  requireProject = false,
  allowedProjectIds,
}: ProjectSelectProps) {
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);

  const visibleProjects =
    allowedProjectIds && allowedProjectIds.length > 0
      ? projects.filter((p) => allowedProjectIds.includes(p.id))
      : projects;

  useEffect(() => {
    fetchProjects().then((list) => {
      setProjects(list);
      setLoading(false);

      if (!value) return;

      const resolved = coerceProjectUuid(value, list);
      if (resolved && resolved !== value) onChange(resolved);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (projects.length === 0 || !value) return;
    if (isProjectUuid(value)) return;
    const resolved = coerceProjectUuid(value, projects);
    if (resolved && resolved !== value) onChange(resolved);
  }, [projects, value, onChange]);

  const selectedUuid = value
    ? (coerceProjectUuid(value, visibleProjects) ?? UNASSIGNED_VALUE)
    : UNASSIGNED_VALUE;

  const handleChange = (next: string) => {
    onChange(next === UNASSIGNED_VALUE ? null : next);
  };

  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        value={selectedUuid}
        onChange={(e) => handleChange(e.target.value)}
      >
        {!requireProject && (
          <option value={UNASSIGNED_VALUE}>No Project Assigned (Assign Later)</option>
        )}
        {requireProject && !selectedUuid && (
          <option value="">Select project…</option>
        )}
        {loading && visibleProjects.length === 0 ? (
          <option value="" disabled>
            Loading projects…
          </option>
        ) : (
          visibleProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))
        )}
      </select>
      {!loading && visibleProjects.length === 0 && (
        <p className="text-xs text-slate-500">
          {allowedProjectIds && allowedProjectIds.length > 0
            ? "No projects assigned to your profile. Ask your supervisor to grant access in Security Settings."
            : "No projects in database yet — you can assign this worker later via the Worker Project Scheduler or Worker Profile."}
        </p>
      )}
      {!loading &&
        visibleProjects.length > 0 &&
        value &&
        !isProjectUuid(value) &&
        !coerceProjectUuid(value, visibleProjects) && (
        <p className="text-xs text-amber-700">
          Legacy project value detected — pick a project or leave unassigned.
        </p>
      )}
    </label>
  );
}
