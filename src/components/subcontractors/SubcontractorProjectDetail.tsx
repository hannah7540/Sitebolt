"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  assignSubcontractorPlantToProject,
  assignSubcontractorWorkerToProject,
  moveSubcontractorPlantProject,
  moveSubcontractorWorkerProject,
  removeSubcontractorPlantFromProject,
  removeSubcontractorWorkerFromProject,
} from "@/lib/subcontractor-portal-assignments";
import type {
  SubcontractorPortalPlant,
  SubcontractorPortalWorker,
} from "@/lib/subcontractor-portal-models";
import type { SubcontractorPortalProject } from "@/lib/subcontractor-portal-models";
import {
  cardClass,
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";
import { formatDateOnly } from "@/lib/scheduler-utils";

type Tab = "workers" | "plant";
type Modal =
  | { kind: "add-worker" }
  | { kind: "add-plant" }
  | { kind: "move-worker"; worker: SubcontractorPortalWorker }
  | { kind: "move-plant"; plant: SubcontractorPortalPlant }
  | null;

export default function SubcontractorProjectDetail({
  subcontractorId,
  project,
  projects,
  workers,
  plant,
  assignedWorkers,
  assignedPlant,
}: {
  subcontractorId: string;
  project: SubcontractorPortalProject;
  projects: SubcontractorPortalProject[];
  workers: SubcontractorPortalWorker[];
  plant: SubcontractorPortalPlant[];
  assignedWorkers: SubcontractorPortalWorker[];
  assignedPlant: SubcontractorPortalPlant[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("workers");
  const [modal, setModal] = useState<Modal>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableWorkers = useMemo(
    () =>
      workers.filter(
        (worker) => !assignedWorkers.some((assigned) => assigned.id === worker.id)
      ),
    [workers, assignedWorkers]
  );
  const availablePlant = useMemo(
    () => plant.filter((item) => !assignedPlant.some((assigned) => assigned.id === item.id)),
    [plant, assignedPlant]
  );
  const otherProjects = projects.filter((row) => row.id !== project.id);

  const refresh = () => router.refresh();

  const run = async (action: () => Promise<{ error: string | null }>) => {
    setSaving(true);
    setError(null);
    const result = await action();
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setModal(null);
    refresh();
  };

  return (
    <div className="space-y-4">
      <section className={`${cardClass} p-6`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
          Project
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{project.name}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {project.location || "Assign your workers and plant to this site."}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("workers")}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            tab === "workers"
              ? "bg-orange-500 text-white"
              : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          Assigned Workers
        </button>
        <button
          type="button"
          onClick={() => setTab("plant")}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
            tab === "plant"
              ? "bg-orange-500 text-white"
              : "border border-slate-200 bg-white text-slate-600"
          }`}
        >
          Assigned Plant
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {tab === "workers" ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Assigned Workers</h3>
            <button
              type="button"
              onClick={() => setModal({ kind: "add-worker" })}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              Add Existing Worker
            </button>
          </div>
          <AssignmentTable
            empty="No workers assigned to this project yet."
            rows={assignedWorkers.map((worker) => ({
              id: worker.id,
              cells: [worker.name, worker.trade, worker.email],
              onMove: () => setModal({ kind: "move-worker", worker }),
              onRemove: () =>
                void run(() =>
                  removeSubcontractorWorkerFromProject({
                    subcontractorId,
                    workerId: worker.id,
                    projectId: project.id,
                  })
                ),
            }))}
            headers={["Name", "Trade", "Email"]}
            saving={saving}
          />
        </section>
      ) : (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Assigned Plant</h3>
            <button
              type="button"
              onClick={() => setModal({ kind: "add-plant" })}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              <Plus className="h-4 w-4" />
              Add Existing Plant
            </button>
          </div>
          <AssignmentTable
            empty="No plant assigned to this project yet."
            rows={assignedPlant.map((item) => ({
              id: item.id,
              cells: [item.make, item.model, item.serial_number],
              onMove: () => setModal({ kind: "move-plant", plant: item }),
              onRemove: () =>
                void run(() =>
                  removeSubcontractorPlantFromProject({
                    subcontractorId,
                    plantId: item.id,
                    projectId: project.id,
                  })
                ),
            }))}
            headers={["Make", "Model", "Serial Number"]}
            saving={saving}
          />
        </section>
      )}

      {modal?.kind === "add-worker" ? (
        <SelectModal
          title="Add Existing Worker"
          label="Worker"
          options={availableWorkers.map((worker) => ({
            id: worker.id,
            label: `${worker.name} — ${worker.trade}`,
          }))}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={(workerId) => {
            const worker = workers.find((row) => row.id === workerId);
            if (!worker) return;
            void run(() =>
              assignSubcontractorWorkerToProject({
                subcontractorId,
                workerId: worker.id,
                workerName: worker.name,
                projectId: project.id,
                projectName: project.name,
              })
            );
          }}
        />
      ) : null}

      {modal?.kind === "add-plant" ? (
        <SelectModal
          title="Add Existing Plant"
          label="Plant"
          options={availablePlant.map((item) => ({
            id: item.id,
            label: `${item.make} ${item.model} — ${item.serial_number}`,
          }))}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={(plantId) => {
            void run(() =>
              assignSubcontractorPlantToProject({
                subcontractorId,
                plantId,
                projectId: project.id,
                projectName: project.name,
              })
            );
          }}
        />
      ) : null}

      {modal?.kind === "move-worker" ? (
        <MoveModal
          title={`Move ${modal.worker.name}`}
          projects={otherProjects}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={(toProjectId, effectiveFrom) => {
            const next = projects.find((row) => row.id === toProjectId);
            if (!next) return;
            void run(() =>
              moveSubcontractorWorkerProject({
                subcontractorId,
                workerId: modal.worker.id,
                workerName: modal.worker.name,
                fromProjectId: project.id,
                toProjectId: next.id,
                toProjectName: next.name,
                effectiveFrom,
              })
            );
          }}
        />
      ) : null}

      {modal?.kind === "move-plant" ? (
        <MoveModal
          title={`Move ${modal.plant.make} ${modal.plant.model}`}
          projects={otherProjects}
          saving={saving}
          onClose={() => setModal(null)}
          onSubmit={(toProjectId, effectiveFrom) => {
            const next = projects.find((row) => row.id === toProjectId);
            if (!next) return;
            void run(() =>
              moveSubcontractorPlantProject({
                subcontractorId,
                plantId: modal.plant.id,
                fromProjectId: project.id,
                toProjectId: next.id,
                toProjectName: next.name,
                effectiveFrom,
              })
            );
          }}
        />
      ) : null}
    </div>
  );
}

function AssignmentTable({
  headers,
  rows,
  empty,
  saving,
}: {
  headers: string[];
  rows: Array<{
    id: string;
    cells: string[];
    onMove: () => void;
    onRemove: () => void;
  }>;
  empty: string;
  saving: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-4 py-3">
                {header}
              </th>
            ))}
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-8 text-slate-500" colSpan={headers.length + 1}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                {row.cells.map((cell) => (
                  <td key={cell} className="px-4 py-3 text-slate-700">
                    {cell}
                  </td>
                ))}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={row.onMove}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Move Project
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={row.onRemove}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Remove from Project
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelectModal({
  title,
  label,
  options,
  saving,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  options: Array<{ id: string; label: string }>;
  saving: boolean;
  onClose: () => void;
  onSubmit: (id: string) => void;
}) {
  const [selected, setSelected] = useState(options[0]?.id ?? "");

  return (
    <div className={modalOverlayClass}>
      <form
        className={`${modalClass} max-w-lg space-y-4`}
        onSubmit={(event) => {
          event.preventDefault();
          if (selected) onSubmit(selected);
        }}
      >
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {options.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing available to assign.</p>
        ) : (
          <label className="block space-y-1">
            <span className={labelClass}>{label}</span>
            <select
              className={inputClass}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !selected}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign
          </button>
        </div>
      </form>
    </div>
  );
}

function MoveModal({
  title,
  projects,
  saving,
  onClose,
  onSubmit,
}: {
  title: string;
  projects: SubcontractorPortalProject[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (projectId: string, effectiveFrom: string) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(formatDateOnly(new Date()));

  return (
    <div className={modalOverlayClass}>
      <form
        className={`${modalClass} max-w-lg space-y-4`}
        onSubmit={(event) => {
          event.preventDefault();
          if (projectId && effectiveFrom) onSubmit(projectId, effectiveFrom);
        }}
      >
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-slate-500">
            You need another assigned project before you can move this assignment.
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className={labelClass}>New project</span>
              <select
                className={inputClass}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Effective date</span>
              <input
                className={inputClass}
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
              />
            </label>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !projectId || !effectiveFrom}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Move
          </button>
        </div>
      </form>
    </div>
  );
}
