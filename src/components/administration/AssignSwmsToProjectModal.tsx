"use client";

import { useMemo, useState } from "react";
import { Loader2, Search, Send, Users, UserRound, X } from "lucide-react";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import {
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  assignSwmsWorkersRequest,
  pushSwmsToProject,
  resolveSwmsScope,
  resolveSwmsTargetId,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import { notifySwmsAssignmentsClientSide } from "@/lib/swms-assignment-notify-client";
import type { Worker } from "@/lib/supabase";
import WorkerSearchSelect from "@/components/assets/WorkerSearchSelect";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type AssignMode = "full_project" | "specific_workers";

interface AssignSwmsToProjectModalProps {
  swms: SwmsDocumentSummary;
  projects: DbProject[];
  workers: Worker[];
  onClose: () => void;
  onAssigned: () => void;
}

export default function AssignSwmsToProjectModal({
  swms,
  projects,
  workers,
  onClose,
  onAssigned,
}: AssignSwmsToProjectModalProps) {
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const isCompanyTemplate = resolveSwmsScope(swms) !== "site_specific";
  const linkedProjectId = swms.project_id?.trim() || "";

  const [mode, setMode] = useState<AssignMode>("full_project");
  const [projectId, setProjectId] = useState(
    linkedProjectId || activeProjects[0]?.id || ""
  );
  const [projectQuery, setProjectQuery] = useState("");
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const eligibleWorkers = useMemo(
    () =>
      workers.filter(
        (worker) =>
          !worker.is_subcontractor &&
          worker.status !== "Revoked" &&
          !worker.is_revoked
      ),
    [workers]
  );

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return activeProjects;
    return activeProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(q) ||
        project.id.toLowerCase().includes(q)
    );
  }, [activeProjects, projectQuery]);

  const handleAssign = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const canonicalSwmsId = resolveSwmsTargetId(swms) || swms.id?.trim() || "";
    if (!canonicalSwmsId) {
      setError("This SWMS is missing a valid document id. Refresh and try again.");
      setSaving(false);
      return;
    }

    try {
      if (mode === "full_project") {
        if (!projectId.trim()) {
          setError("Select a target project.");
          return;
        }

        if (isCompanyTemplate) {
          const { workerByProject } = await loadAssignmentMaps();
          const projectWorkers = filterWorkersForProject(
            eligibleWorkers,
            projectId,
            workerByProject
          ).map((worker) => ({
            id: worker.id,
            name: getWorkerDisplayName(worker),
          }));

          if (projectWorkers.length === 0) {
            setError("No workers are assigned to the selected project.");
            return;
          }

          const { error: pushError, document } = await pushSwmsToProject({
            masterSwms: swms,
            projectId,
            projectWorkers,
          });

          if (pushError || !document) {
            setError(pushError ?? "Failed to push SWMS to project.");
            return;
          }

          const createdSwmsId =
            resolveSwmsTargetId(document) || document.id?.trim() || "";
          if (!createdSwmsId) {
            setError(
              "Push succeeded but the site-specific SWMS id was missing. Refresh and assign workers manually."
            );
            return;
          }

          notifySwmsAssignmentsClientSide(projectWorkers.map((w) => w.id));
          void assignSwmsWorkersRequest({
            swmsId: createdSwmsId,
            workerIds: projectWorkers.map((w) => w.id),
            notifyOnly: true,
            swmsTitle: swms.title,
          });

          const projectName =
            activeProjects.find((project) => project.id === projectId)?.name ??
            "project";
          setSuccess(
            `"${swms.title}" pushed to ${projectName}. ${projectWorkers.length} worker(s) must sign off.`
          );
          onAssigned();
          return;
        }

        const result = await assignSwmsWorkersRequest({
          swmsId: canonicalSwmsId,
          projectId,
          assignAllProjectMembers: true,
          mode: "project",
          swmsTitle: swms.title,
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        notifySwmsAssignmentsClientSide(result.createdWorkerIds);
        const projectName =
          activeProjects.find((project) => project.id === projectId)?.name ??
          "project";
        setSuccess(
          result.created > 0
            ? `Assigned to ${result.created} worker(s) on ${projectName}.${
                result.skipped > 0 ? ` ${result.skipped} already had it.` : ""
              }`
            : `All selected project members already have this SWMS${
                result.skipped > 0 ? ` (${result.skipped} skipped)` : ""
              }.`
        );
        onAssigned();
        return;
      }

      if (selectedWorkerIds.length === 0) {
        setError("Select at least one worker.");
        return;
      }

      const result = await assignSwmsWorkersRequest({
        swmsId: canonicalSwmsId,
        workerIds: selectedWorkerIds,
        projectId: linkedProjectId || undefined,
        mode: "workers",
        swmsTitle: swms.title,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      notifySwmsAssignmentsClientSide(result.createdWorkerIds);
      setSuccess(
        result.created > 0
          ? `Assigned to ${result.created} worker(s).${
              result.skipped > 0 ? ` ${result.skipped} already had it.` : ""
            }`
          : `All selected workers already have this SWMS${
              result.skipped > 0 ? ` (${result.skipped} skipped)` : ""
            }.`
      );
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign SWMS.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assign SWMS</h2>
            <p className="text-sm text-slate-500">
              {isCompanyTemplate
                ? `Push or assign “${swms.title}” to a project or individual workers.`
                : `Assign “${swms.title}” to project members or specific workers.`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("full_project")}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-3 text-left transition",
                  mode === "full_project"
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Assign to Full Project
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {isCompanyTemplate
                      ? "Clone as site-specific SWMS for all project members"
                      : "Assign to every worker on the project"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("specific_workers")}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-3 text-left transition",
                  mode === "specific_workers"
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Assign to Specific Worker
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Search company workers by name or email
                  </span>
                </span>
              </button>
            </div>

            {mode === "full_project" ? (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className={labelClass}>Search projects</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={projectQuery}
                      onChange={(event) => setProjectQuery(event.target.value)}
                      placeholder="Filter by project name…"
                      className={cn(inputClass, "pl-9")}
                    />
                  </div>
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>Target Project *</span>
                  <select
                    className={inputClass}
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    {filteredProjects.length === 0 ? (
                      <option value="">No matching projects</option>
                    ) : (
                      filteredProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <p className="text-xs text-slate-500">
                  All workers currently attached to the project will receive a pending
                  sign-off
                  {isCompanyTemplate ? " for a cloned site-specific SWMS." : "."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <WorkerSearchSelect
                  mode="multiple"
                  workers={eligibleWorkers}
                  selected={selectedWorkerIds}
                  onChange={setSelectedWorkerIds}
                  label="Workers *"
                  searchPlaceholder="Search by name or email…"
                  placeholder="Select one or more workers"
                />
                <p className="text-xs text-slate-500">
                  Assigns this SWMS directly to the selected worker(s), regardless of
                  project membership. Existing pending assignments are skipped.
                </p>
              </div>
            )}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  (mode === "full_project"
                    ? filteredProjects.length === 0
                    : selectedWorkerIds.length === 0)
                }
                onClick={() => void handleAssign()}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {mode === "full_project" && isCompanyTemplate
                  ? "Push to Project"
                  : "Assign SWMS"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
