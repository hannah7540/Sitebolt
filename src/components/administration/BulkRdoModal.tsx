"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import {
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { insertBulkRdoEvents, type BulkRdoInput, type BulkRdoInsertResult } from "@/lib/worker-calendar-events";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface BulkRdoModalProps {
  workers: Worker[];
  projects: DbProject[];
  onClose: () => void;
  onSaved: () => void;
  onSubmit?: (input: BulkRdoInput) => Promise<BulkRdoInsertResult>;
}

const STEPS = ["Select Date(s)", "Select Project(s)", "Select Worker(s)", "Notes"];

export default function BulkRdoModal({
  workers,
  projects,
  onClose,
  onSaved,
  onSubmit,
}: BulkRdoModalProps) {
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const today = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState(0);
  const [useDateRange, setUseDateRange] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("15:30");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [tradeFilter, setTradeFilter] = useState("");
  const [notes, setNotes] = useState("");
  const [workerByProject, setWorkerByProject] = useState<Map<string, string[]>>(
    new Map()
  );
  const [mapsLoading, setMapsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAssignmentMaps().then(({ workerByProject: map }) => {
      setWorkerByProject(map);
      setMapsLoading(false);
    });
  }, []);

  useEffect(() => {
    if (activeProjects.length > 0 && selectedProjectIds.length === 0) {
      setSelectedProjectIds(activeProjects.map((project) => project.id));
    }
  }, [activeProjects, selectedProjectIds.length]);

  const eligibleWorkers = useMemo(() => {
    if (selectedProjectIds.length === 0) return [];
    const ids = new Set<string>();
    const list: Worker[] = [];

    for (const projectId of selectedProjectIds) {
      for (const worker of filterWorkersForProject(workers, projectId, workerByProject)) {
        if (!ids.has(worker.id)) {
          ids.add(worker.id);
          list.push(worker);
        }
      }
    }

    return list.sort((left, right) =>
      getWorkerDisplayName(left).localeCompare(getWorkerDisplayName(right))
    );
  }, [workers, selectedProjectIds, workerByProject]);

  const tradeOptions = useMemo(() => {
    const trades = new Set<string>();
    for (const worker of eligibleWorkers) {
      const trade = worker.trade?.trim();
      if (trade) trades.add(trade);
    }
    return [...trades].sort();
  }, [eligibleWorkers]);

  const filteredWorkers = useMemo(() => {
    let list = eligibleWorkers;
    if (tradeFilter) {
      list = list.filter((worker) => worker.trade?.trim() === tradeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((worker) => {
        const name = getWorkerDisplayName(worker).toLowerCase();
        const trade = (worker.trade ?? "").toLowerCase();
        return name.includes(q) || trade.includes(q) || worker.email.toLowerCase().includes(q);
      });
    }
    return list;
  }, [eligibleWorkers, tradeFilter, searchQuery]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
    setSelectedWorkerIds(new Set());
  };

  const toggleWorker = (workerId: string) => {
    setSelectedWorkerIds((prev) => {
      const next = new Set(prev);
      if (next.has(workerId)) next.delete(workerId);
      else next.add(workerId);
      return next;
    });
  };

  const selectAllWorkers = () => {
    setSelectedWorkerIds(new Set(filteredWorkers.map((worker) => worker.id)));
  };

  const selectAllTrades = () => {
    setSelectedWorkerIds(new Set(eligibleWorkers.map((worker) => worker.id)));
  };

  const resolveWorkerProject = useCallback(
    (worker: Worker): { projectId: string; projectName: string } | null => {
      for (const projectId of selectedProjectIds) {
        const matched = filterWorkersForProject([worker], projectId, workerByProject);
        if (matched.length > 0) {
          const project = activeProjects.find((row) => row.id === projectId);
          return {
            projectId,
            projectName: project?.name ?? "Project",
          };
        }
      }
      const fallback = activeProjects.find((row) => row.id === selectedProjectIds[0]);
      if (!fallback) return null;
      return { projectId: fallback.id, projectName: fallback.name };
    },
    [selectedProjectIds, workerByProject, activeProjects]
  );

  const handleSubmit = async () => {
    setError(null);
    const effectiveEnd = useDateRange ? endDate : startDate;
    if (startDate > effectiveEnd) {
      setError("Invalid date range.");
      return;
    }
    if (selectedProjectIds.length === 0) {
      setError("Select at least one project.");
      return;
    }

    const selectedWorkers = eligibleWorkers.filter((worker) =>
      selectedWorkerIds.has(worker.id)
    );
    if (selectedWorkers.length === 0) {
      setError("Select at least one worker.");
      return;
    }

    setSaving(true);

    const groups = new Map<string, Worker[]>();
    for (const worker of selectedWorkers) {
      const project = resolveWorkerProject(worker);
      if (!project) continue;
      const key = project.projectId;
      const list = groups.get(key) ?? [];
      list.push(worker);
      groups.set(key, list);
    }

    let created = 0;
    const errors: string[] = [];

    for (const [projectId, groupWorkers] of groups) {
      const project = activeProjects.find((row) => row.id === projectId);
      const payload: BulkRdoInput = {
        startDate,
        endDate: effectiveEnd,
        isFullDay,
        startTime: isFullDay ? null : startTime,
        endTime: isFullDay ? null : endTime,
        projectId,
        projectName: project?.name ?? "Project",
        workers: groupWorkers,
        notes,
      };
      const result = onSubmit
        ? await onSubmit(payload)
        : await insertBulkRdoEvents(payload);
      if (result.unavailable) continue;
      if (result.error) errors.push(result.error);
      else created += result.created;
    }

    setSaving(false);

    if (errors.length > 0 && created === 0) {
      setError(errors[0]);
      return;
    }

    if (created === 0) {
      if (errors.length === 0) {
        onSaved();
        onClose();
        return;
      }
      setError(errors[0] ?? "No calendar events were saved. Check the browser console for details.");
      return;
    }

    onSaved();
    onClose();
  };

  const canNext =
    step === 0
      ? Boolean(startDate) && (!useDateRange || Boolean(endDate))
      : step === 1
        ? selectedProjectIds.length > 0
        : step === 2
          ? selectedWorkerIds.size > 0
          : true;

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} flex max-h-[90vh] max-w-2xl flex-col overflow-hidden`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Schedule Bulk RDO</h2>
            <p className="text-sm text-slate-500">
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="mb-4 flex gap-1">
          {STEPS.map((label, index) => (
            <div
              key={label}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                index <= step ? "bg-orange-500" : "bg-slate-200"
              )}
              title={label}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {step === 0 ? (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useDateRange}
                  onChange={(event) => setUseDateRange(event.target.checked)}
                  className="rounded border-slate-300 text-orange-500"
                />
                Use date range (otherwise single date)
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={labelClass}>
                    {useDateRange ? "Start Date" : "Date"}
                  </span>
                  <input
                    type="date"
                    className={inputClass}
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </label>
                {useDateRange ? (
                  <label className="block space-y-1">
                    <span className={labelClass}>End Date</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={endDate}
                      onChange={(event) => setEndDate(event.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isFullDay}
                  onChange={(event) => setIsFullDay(event.target.checked)}
                  className="rounded border-slate-300 text-orange-500"
                />
                Full day RDO
              </label>
              {!isFullDay ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className={labelClass}>Start Time</span>
                    <input
                      type="time"
                      className={inputClass}
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelClass}>End Time</span>
                    <input
                      type="time"
                      className={inputClass}
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedProjectIds(activeProjects.map((project) => project.id))
                  }
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
                >
                  Select All Projects
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectIds([]);
                    setSelectedWorkerIds(new Set());
                  }}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                {activeProjects.map((project) => (
                  <label
                    key={project.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={() => toggleProject(project.id)}
                      className="rounded border-slate-300 text-orange-500"
                    />
                    <span className="text-sm text-slate-800">{project.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {eligibleWorkers.length} worker(s) eligible across selected projects.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              {mapsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading workers…
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllWorkers}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
                    >
                      Select All Workers
                    </button>
                    <button
                      type="button"
                      onClick={selectAllTrades}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-orange-50"
                    >
                      Select All Trades
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="search"
                        placeholder="Search workers…"
                        className={`${inputClass} pl-9`}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </div>
                    <select
                      className={inputClass}
                      value={tradeFilter}
                      onChange={(event) => setTradeFilter(event.target.value)}
                    >
                      <option value="">All trades</option>
                      {tradeOptions.map((trade) => (
                        <option key={trade} value={trade}>
                          {trade}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                    {filteredWorkers.length === 0 ? (
                      <p className="p-3 text-sm text-slate-500">No workers match.</p>
                    ) : (
                      filteredWorkers.map((worker) => (
                        <label
                          key={worker.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedWorkerIds.has(worker.id)}
                            onChange={() => toggleWorker(worker.id)}
                            className="rounded border-slate-300 text-orange-500"
                          />
                          <span className="text-sm text-slate-800">
                            {getWorkerDisplayName(worker)}
                            {worker.trade ? (
                              <span className="ml-1 text-xs text-slate-500">
                                · {worker.trade}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {selectedWorkerIds.size} worker(s) selected.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <label className="block space-y-1">
              <span className={labelClass}>Optional notes</span>
              <textarea
                className={`${inputClass} min-h-[100px]`}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Scheduled Site-Wide RDO, Trade RDO…"
              />
              <p className="text-xs text-slate-500">
                Scheduling RDO for {selectedWorkerIds.size} worker(s) on{" "}
                {useDateRange ? `${startDate} → ${endDate}` : startDate}.
              </p>
            </label>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex justify-between gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            disabled={step === 0 || saving}
            onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((prev) => prev + 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || selectedWorkerIds.size === 0}
              onClick={() => void handleSubmit()}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Schedule Bulk RDO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
