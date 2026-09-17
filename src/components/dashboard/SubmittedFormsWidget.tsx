"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, Loader2 } from "lucide-react";
import FormSubmissionDetailModal from "@/components/forms/FormSubmissionDetailModal";
import SubmittedFormsPortal, {
  type SubmittedFormRowMeta,
} from "@/components/dashboard/SubmittedFormsPortal";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import { useWorkerHistoryLayer } from "@/hooks/useWorkerHistoryLayer";
import {
  fetchCustomFormSubmissions,
  formatFormDate,
  type CustomFormSubmission,
} from "@/lib/custom-forms";
import { fetchProjects, getCachedProjects } from "@/lib/project-resolver";
import { resolvePlantAssignedProjectId } from "@/lib/project-assignments";
import { fetchPlantList, type PlantAsset } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface SubmittedFormsWidgetProps {
  projectId?: string | null;
  projectIds?: string[];
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatFormDate(iso);
}

function plantLabel(plant: PlantAsset | undefined): string {
  if (!plant) return "Plant";
  const code = plant.unit_number || plant.plant_number || plant.name;
  return code ? `Plant • ${code}` : "Plant";
}

function entityTag(
  submission: CustomFormSubmission,
  plantById: Map<string, PlantAsset>
): string {
  if (submission.plant_id) return plantLabel(plantById.get(submission.plant_id));
  if (submission.fleet_id) return "Fleet";
  if (submission.asset_id) return "Asset";
  if (submission.worker_id) return "Worker";
  if (submission.project_id) return "Project";
  return "Form";
}

export default function SubmittedFormsWidget({
  projectId = null,
  projectIds = [],
}: SubmittedFormsWidgetProps) {
  const [submissions, setSubmissions] = useState<CustomFormSubmission[]>([]);
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<CustomFormSubmission | null>(null);

  const closeWidget = useCallback(() => {
    setViewing(null);
    setOpen(false);
  }, []);

  const handleBack = useCallback(() => {
    if (viewing) {
      setViewing(null);
      return true;
    }
    if (open) {
      setOpen(false);
      return true;
    }
    return false;
  }, [open, viewing]);

  useMobileBackHandler(handleBack, open);
  useWorkerHistoryLayer(open, () => {
    if (viewing) setViewing(null);
    else setOpen(false);
  }, "submitted-forms");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [submissionResult, plantRows] = await Promise.all([
      fetchCustomFormSubmissions(
        projectId
          ? { projectId, includeAssignedPlant: true }
          : {}
      ),
      fetchPlantList(),
      fetchProjects().catch(() => []),
    ]);
    if (submissionResult.error) {
      setError(submissionResult.error);
      setSubmissions([]);
    } else {
      setSubmissions(submissionResult.data);
    }
    setPlant(plantRows);
    const names: Record<string, string> = {};
    for (const project of getCachedProjects()) {
      names[project.id] = project.name;
    }
    setProjectNames(names);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const plantById = useMemo(
    () => new Map(plant.map((item) => [item.id, item])),
    [plant]
  );

  const scopedSubmissions = useMemo(() => {
    if (projectId) return submissions;
    if (projectIds.length === 0) return submissions;
    const selected = new Set(projectIds);
    return submissions.filter((submission) => {
      if (submission.project_id && selected.has(submission.project_id)) return true;
      if (!submission.plant_id) return false;
      const assigned = resolvePlantAssignedProjectId(plantById.get(submission.plant_id));
      return Boolean(assigned && selected.has(assigned));
    });
  }, [plantById, projectId, projectIds, submissions]);

  const rowMeta = useMemo(() => {
    const next: Record<string, SubmittedFormRowMeta> = {};
    for (const submission of scopedSubmissions) {
      const plantProjectId = submission.plant_id
        ? resolvePlantAssignedProjectId(plantById.get(submission.plant_id))
        : "";
      const projectKey = submission.project_id || plantProjectId;
      next[submission.id] = {
        entityTag: entityTag(submission, plantById),
        projectName: projectKey ? projectNames[projectKey] ?? null : null,
        relativeTime: formatRelativeTime(submission.submitted_at),
      };
    }
    return next;
  }, [plantById, projectNames, scopedSubmissions]);

  const recent = scopedSubmissions.slice(0, 3);
  const count = scopedSubmissions.length;
  const showProjectName = !projectId;
  const countLabel = loading
    ? "Loading forms…"
    : `${count} form${count === 1 ? "" : "s"} filed`;

  const openList = () => {
    setViewing(null);
    setOpen(true);
  };

  const openSubmission = (submission: CustomFormSubmission) => {
    setViewing(submission);
    setOpen(true);
  };

  return (
    <>
      <div className={cn(cardClass, "flex h-full flex-col p-5")}>
        <button
          type="button"
          onClick={openList}
          className="mb-3 flex w-full items-start justify-between gap-3 text-left"
          aria-label="Open submitted forms"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ClipboardList className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Submitted Forms</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Custom form submissions for this dashboard
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={openList}
          className="mb-3 inline-flex w-fit rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-800"
        >
          {countLabel}
        </button>

        {loading ? (
          <p className="text-sm text-slate-500">Loading submissions…</p>
        ) : error ? (
          <p className="text-sm text-slate-500">Submitted forms unavailable.</p>
        ) : recent.length === 0 ? (
          <button
            type="button"
            onClick={openList}
            className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500"
          >
            No forms submitted yet.
          </button>
        ) : (
          <ul className="space-y-2">
            {recent.map((submission) => {
              const meta = rowMeta[submission.id];
              const snippet = [
                submission.template_title || "Untitled form",
                meta?.entityTag,
                meta?.relativeTime,
              ]
                .filter(Boolean)
                .join(" • ");
              return (
                <li key={submission.id}>
                  <button
                    type="button"
                    onClick={() => openSubmission(submission)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                  >
                    <p className="truncate text-sm font-medium text-slate-900">
                      {submission.template_title || "Untitled form"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {submission.submitted_by_name || "Unknown submitter"}
                      {showProjectName && meta?.projectName ? ` · ${meta.projectName}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-600">{snippet}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SubmittedFormsPortal
        open={open && !viewing}
        submissions={scopedSubmissions}
        rowMeta={rowMeta}
        loading={loading}
        error={error}
        showProjectName={showProjectName}
        onClose={closeWidget}
        onSelect={openSubmission}
      />
      <FormSubmissionDetailModal
        open={Boolean(viewing)}
        submission={viewing}
        onClose={() => setViewing(null)}
      />
      {viewing ? (
        <WorkerMobileBackButton
          label="Back"
          onClick={() => setViewing(null)}
          alwaysVisible
          className="z-[80]"
        />
      ) : null}
    </>
  );
}
