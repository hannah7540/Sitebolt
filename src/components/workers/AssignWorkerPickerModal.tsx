"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { getWorkerTicketStatus, getTicketBadgeLabel } from "@/lib/worker-compliance";
import { groupVocsByWorker } from "@/lib/voc-utils";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AssignWorkerPickerModalProps {
  projectName: string;
  workers: Worker[];
  workerVocs: WorkerVoc[];
  assignedWorkerIds: string[];
  onClose: () => void;
  onAssign: (workerIds: string[]) => Promise<{ error: string | null }>;
}

export default function AssignWorkerPickerModal({
  projectName,
  workers,
  workerVocs,
  assignedWorkerIds,
  onClose,
  onAssign,
}: AssignWorkerPickerModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vocsByWorker = useMemo(() => groupVocsByWorker(workerVocs), [workerVocs]);
  const assigned = useMemo(() => new Set(assignedWorkerIds), [assignedWorkerIds]);

  const availableWorkers = useMemo(
    () => workers.filter((worker) => !assigned.has(worker.id)),
    [workers, assigned]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableWorkers;
    return availableWorkers.filter((worker) => {
      const name = getWorkerDisplayName(worker).toLowerCase();
      return (
        name.includes(q) ||
        worker.email.toLowerCase().includes(q) ||
        (worker.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [availableWorkers, query]);

  const toggle = (workerId: string) => {
    setSelectedIds((prev) =>
      prev.includes(workerId) ? prev.filter((id) => id !== workerId) : [...prev, workerId]
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
            <h2 className="text-lg font-bold text-slate-900">Assign Worker to Project</h2>
            <p className="mt-1 text-sm text-slate-500">
              Select workers from the organisation master directory for{" "}
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
          placeholder="Search name, email, phone…"
          className={cn(inputClass, "mb-3")}
        />

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-slate-500">
              No available workers found. Add workers under Organisation → Workers.
            </p>
          ) : (
            filtered.map((worker) => {
              const vocs = vocsByWorker[worker.id] ?? [];
              const ticketStatus = getWorkerTicketStatus(worker, vocs);

              return (
                <label
                  key={worker.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(worker.id)}
                    onChange={() => toggle(worker.id)}
                    className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {getWorkerDisplayName(worker)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {worker.email} · {getTicketBadgeLabel(ticketStatus)}
                    </span>
                  </span>
                </label>
              );
            })
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
