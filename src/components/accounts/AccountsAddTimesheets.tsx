"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Trash2, UserRound } from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import WorkerSearchSelect from "@/components/assets/WorkerSearchSelect";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { isHiredLabourWorker } from "@/lib/hired-labour";
import { fetchAllWorkers, isWorkerDeleted, type Worker } from "@/lib/supabase";
import {
  fetchTimesheetFormOptions,
  formatTimesheetProjectDisplayName,
  formatTimesheetProjectOptionLabel,
  groupTimesheetProjectsByClient,
  type TimesheetProject,
  type TimesheetTask,
} from "@/lib/timesheet-options";
import {
  calculateDailyTotalsFromSlots,
  formatTimesheetHoursLabel,
  localIsoDate,
  validateLineItemTimeRange,
  validateTimesheetWorkDate,
} from "@/lib/timesheet-utils";
import {
  createChainedLineItem,
  createDefaultLineItem,
  isLeaveLineCategory,
  syncLineItemFields,
  TIMESHEET_LINE_CATEGORY_OPTIONS,
  type TimesheetDurationMode,
  type TimesheetLineCategory,
} from "@/lib/timesheet-line-items";
import { resolvePayRuleTemplateNameForWorker } from "@/lib/worker-pay-rule-assignment";
import {
  isActTimesheetJurisdiction,
  mandatoryTimesheetBreakMessage,
  requiresMandatoryTimesheetBreak,
  validateActBreakRequirement,
} from "@/lib/timesheet-act-break-validation";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { isProjectUuid } from "@/lib/project-resolver";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type DualTimesheetEntry = {
  id: string;
  projectId: string;
  category: TimesheetLineCategory;
  durationMode: TimesheetDurationMode;
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

function resolveWorkerUuid(worker: Worker | null | undefined): string | null {
  const workerId = worker?.id?.trim() || "";
  return isProjectUuid(workerId) ? workerId : null;
}

function isActiveWorker(worker: Worker): boolean {
  if (isWorkerDeleted(worker)) return false;
  if (isHiredLabourWorker(worker)) return false;
  return worker.status !== "Revoked" && !worker.is_revoked && !worker.is_archived;
}

function resolveWorkerTrade(worker: Worker): string {
  return (
    worker.trade?.trim() ||
    (worker as { trade_role?: string | null }).trade_role?.trim() ||
    "—"
  );
}

function createBlankEntry(
  category: TimesheetLineCategory = "work",
  projectId = ""
): DualTimesheetEntry {
  const line = syncLineItemFields(createDefaultLineItem(category));
  return {
    id: line.id,
    projectId,
    category: line.category ?? "work",
    durationMode: isLeaveLineCategory(category) ? "full_day" : "partial",
    startTime: line.startTime,
    endTime: line.endTime,
    breakMinutes: 0,
  };
}

function entryToActivity(entry: DualTimesheetEntry) {
  const isLeave = isLeaveLineCategory(entry.category);
  return syncLineItemFields({
    ...createDefaultLineItem(entry.category),
    id: entry.id,
    category: entry.category,
    durationMode: isLeave ? entry.durationMode : "partial",
    startTime: entry.startTime,
    endTime: entry.endTime,
  });
}

export default function AccountsAddTimesheets() {
  const todayIso = localIsoDate();
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [tasks, setTasks] = useState<TimesheetTask[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [workDate, setWorkDate] = useState(todayIso);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<DualTimesheetEntry[]>([createBlankEntry()]);
  const [showSecondEntry, setShowSecondEntry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showViewLink, setShowViewLink] = useState(false);

  const loadWorkers = useCallback(async () => {
    setWorkersLoading(true);
    const result = await fetchAllWorkers();
    setWorkers(result.workers.filter(isActiveWorker));
    setWorkersLoading(false);
  }, []);

  const loadTimesheetOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);
    const result = await fetchTimesheetFormOptions();
    setProjects(result.projects);
    setTasks(result.tasks);
    if (result.error) {
      setOptionsError(result.error);
    }
    setOptionsLoading(false);
  }, []);

  useEffect(() => {
    void loadWorkers();
    void loadTimesheetOptions();
  }, [loadWorkers, loadTimesheetOptions]);

  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.id === selectedWorkerId) ?? null,
    [workers, selectedWorkerId]
  );

  const projectGroups = useMemo(
    () => groupTimesheetProjectsByClient(projects),
    [projects]
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const visibleEntries = useMemo(
    () => (showSecondEntry ? entries.slice(0, 2) : entries.slice(0, 1)),
    [entries, showSecondEntry]
  );

  const activities = useMemo(
    () => visibleEntries.map(entryToActivity),
    [visibleEntries]
  );

  const totals = useMemo(() => {
    const base = calculateDailyTotalsFromSlots(activities, []);
    const breakMinutes = visibleEntries.reduce((sum, entry) => {
      if (isLeaveLineCategory(entry.category)) return sum;
      return sum + Math.max(0, Number(entry.breakMinutes) || 0);
    }, 0);
    if (breakMinutes <= 0) return base;

    const breakHours = Math.round((breakMinutes / 60) * 100) / 100;
    const grossWorkHours = base.grossWorkHours;
    const workHours = Math.max(
      0,
      Math.round((grossWorkHours - breakHours) * 100) / 100
    );
    return {
      ...base,
      breakHours,
      workHours,
      grossWorkHours,
      dailyTotalHours: Math.max(
        0,
        Math.round((grossWorkHours + base.leaveHours) * 100) / 100
      ),
    };
  }, [activities, visibleEntries]);

  const payRuleLabel = useMemo(() => {
    if (!selectedWorker) return "—";
    return resolvePayRuleTemplateNameForWorker(selectedWorker.state) ?? "—";
  }, [selectedWorker]);

  const breakJurisdiction = {
    workerState: selectedWorker?.state,
    payRuleName: payRuleLabel === "—" ? null : payRuleLabel,
  };
  const isActWorker = isActTimesheetJurisdiction(breakJurisdiction);
  const requiresBreak = requiresMandatoryTimesheetBreak(breakJurisdiction);
  const breakRequiredMessage = mandatoryTimesheetBreakMessage(breakJurisdiction);

  const lineItemErrors = useMemo(
    () =>
      visibleEntries.map((entry) =>
        validateLineItemTimeRange(entry.startTime, entry.endTime)
      ),
    [visibleEntries]
  );

  const updateEntry = (id: string, updates: Partial<DualTimesheetEntry>) => {
    setEntries((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...updates } : row))
    );
  };

  const handleCategoryChange = (id: string, category: TimesheetLineCategory) => {
    if (isLeaveLineCategory(category)) {
      updateEntry(id, {
        category,
        durationMode: "full_day",
        startTime: "06:30",
        endTime: "14:30",
        breakMinutes: 0,
      });
      return;
    }

    updateEntry(id, {
      category,
      durationMode: "partial",
    });
  };

  const handleDurationModeChange = (
    id: string,
    durationMode: TimesheetDurationMode
  ) => {
    if (durationMode === "full_day") {
      updateEntry(id, {
        durationMode,
        startTime: "06:30",
        endTime: "14:30",
      });
      return;
    }
    updateEntry(id, { durationMode });
  };

  const handleAddSecondEntry = () => {
    setEntries((rows) => {
      const first = rows[0] ?? createBlankEntry();
      const chained = createChainedLineItem(entryToActivity(first), "work");
      const second: DualTimesheetEntry = {
        id: chained.id,
        projectId: first.projectId,
        category: chained.category ?? "work",
        durationMode: "partial",
        startTime: chained.startTime,
        endTime: chained.endTime,
        breakMinutes: 0,
      };
      return [first, second];
    });
    setShowSecondEntry(true);
  };

  const handleRemoveSecondEntry = () => {
    setShowSecondEntry(false);
    setEntries((rows) => [rows[0] ?? createBlankEntry()]);
  };

  const resetForm = () => {
    setWorkDate(todayIso);
    setSelectedTaskId("");
    setNotes("");
    setEntries([createBlankEntry()]);
    setShowSecondEntry(false);
  };

  const handleWorkerChange = (workerId: string | null) => {
    const nextId = workerId?.trim() || null;
    const workerUuid = nextId && isProjectUuid(nextId) ? nextId : null;
    setSelectedWorkerId(workerUuid);
    setShowViewLink(false);

    if (!workerUuid) return;

    const worker = workers.find((item) => item.id === workerUuid);
    if (!worker) return;

    const assignedProjectId =
      worker.assigned_project_id &&
      projects.some((project) => project.id === worker.assigned_project_id)
        ? worker.assigned_project_id
        : "";

    setEntries((rows) =>
      rows.map((row) => ({
        ...row,
        projectId: row.projectId || assignedProjectId,
      }))
    );

    const tradeName = resolveWorkerTrade(worker);
    const matchedTask = tasks.find(
      (task) => task.name.toLowerCase() === tradeName.toLowerCase()
    );
    if (matchedTask) {
      setSelectedTaskId(matchedTask.id);
    }
  };

  const handleSubmit = async () => {
    if (!selectedWorker) {
      showError("Please select a worker.");
      return;
    }

    const workerUuid = resolveWorkerUuid(selectedWorker);
    if (!workerUuid) {
      showError("Selected worker is invalid. Refresh the page and try again.");
      return;
    }

    const dateError = validateTimesheetWorkDate(workDate);
    if (dateError) {
      showError(dateError);
      return;
    }

    if (lineItemErrors.some(Boolean)) {
      showError("Fix entry start/finish times before saving.");
      return;
    }

    for (const [index, entry] of visibleEntries.entries()) {
      const project = projects.find((item) => item.id === entry.projectId) ?? null;
      if (!project || !isProjectUuid(entry.projectId?.trim() || "")) {
        showError(`Please select a project for Entry ${index + 1}.`);
        return;
      }
    }

    if (totals.dailyTotalHours <= 0) {
      showError("Daily total must be greater than 0 hours.");
      return;
    }

    for (const [index, entry] of visibleEntries.entries()) {
      const activity = entryToActivity(entry);
      const actBreakError = validateActBreakRequirement({
        workerState: selectedWorker.state,
        payRuleName: payRuleLabel === "—" ? null : payRuleLabel,
        submit: true,
        breaks: [],
        breakMinutes: isLeaveLineCategory(entry.category) ? 0 : entry.breakMinutes,
        activities: [activity],
      });
      if (actBreakError) {
        showError(`Entry ${index + 1}: ${actBreakError}`);
        return;
      }
    }

    setSubmitting(true);
    setShowViewLink(false);

    try {
      const payloadEntries = visibleEntries.map((entry) => {
        const project = projects.find((item) => item.id === entry.projectId)!;
        const activity = entryToActivity(entry);
        return {
          projectId: entry.projectId.trim(),
          timesheetProject: {
            id: entry.projectId.trim(),
            client: project.client?.trim() || "",
            project: project.project?.trim() || "",
            address: project.address?.trim() || "",
          },
          category: activity.category,
          leaveType: activity.category,
          startTime: activity.startTime?.trim() || "06:30",
          endTime: activity.endTime?.trim() || "14:30",
          breakMinutes: isLeaveLineCategory(entry.category)
            ? 0
            : Math.max(0, Number(entry.breakMinutes) || 0),
          activities: [
            {
              id: activity.id?.trim() || `activity-${activity.startTime}`,
              startTime: activity.startTime?.trim() || "06:30",
              endTime: activity.endTime?.trim() || "14:30",
              label: activity.label?.trim() || "",
              category: activity.category,
            },
          ],
          breaks: [],
        };
      });

      const response = await fetch("/api/accounts/timesheets/approve-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: workerUuid,
          workerName: getWorkerDisplayName(selectedWorker),
          workDate,
          timesheetTaskName:
            selectedTask?.name?.trim() || resolveWorkerTrade(selectedWorker),
          workerTrade:
            selectedTask?.name?.trim() || resolveWorkerTrade(selectedWorker),
          workerState: selectedWorker.state?.trim() || null,
          notes: notes.trim() || null,
          entries: payloadEntries,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        workerName?: string;
        entryCount?: number;
      } | null;

      if (!response.ok) {
        showError(payload?.error ?? "Failed to submit timesheet.");
        return;
      }

      const workerName =
        payload?.workerName ?? getWorkerDisplayName(selectedWorker);
      const entryCount = payload?.entryCount ?? payloadEntries.length;
      showSuccess(
        entryCount > 1
          ? `Submitted and approved ${entryCount} timesheet entries for ${workerName}.`
          : `Timesheet submitted and approved for ${workerName}.`
      );
      resetForm();
      setShowViewLink(true);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to submit timesheet.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AccountsNav />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Add Timesheets</h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit and approve timesheets on behalf of workers. Use a second entry for
          split shifts (for example work + leave on the same day).
        </p>
      </div>

      <div className={cn(cardClass, "space-y-6 p-6")}>
        {workersLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading workers…
          </div>
        ) : (
          <WorkerSearchSelect
            id="worker-search"
            mode="single"
            label="Select Worker"
            workers={workers}
            selected={selectedWorkerId}
            onChange={handleWorkerChange}
            getWorkerLabel={(worker) =>
              worker.full_name?.trim() ||
              worker.name?.trim() ||
              getWorkerDisplayName(worker)
            }
            placeholder="Search by name, email, or mobile…"
            searchPlaceholder="Search by name, email, or mobile…"
            allowClear
          />
        )}

        {selectedWorker ? (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Name
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {getWorkerDisplayName(selectedWorker)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Job / Role
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {resolveWorkerTrade(selectedWorker)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                State / Pay Rule
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {selectedWorker.state ?? "—"} · {payRuleLabel}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            <UserRound className="h-5 w-5 shrink-0 text-slate-400" />
            Select a worker above to enter their timesheet.
          </div>
        )}

        {selectedWorker ? (
          <div className="space-y-5 border-t border-slate-200 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="shift-date" className={labelClass}>
                  Shift Date
                </label>
                <input
                  id="shift-date"
                  type="date"
                  value={workDate}
                  onChange={(event) => setWorkDate(event.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="timesheet-task" className={labelClass}>
                  Work Task
                </label>
                {optionsLoading ? (
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                    Loading tasks…
                  </div>
                ) : (
                  <select
                    id="timesheet-task"
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    className={inputClass}
                    disabled={tasks.length === 0}
                  >
                    <option value="">Select a task…</option>
                    {tasks.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                  Daily Entries
                </h3>
                {!showSecondEntry ? (
                  <button
                    type="button"
                    onClick={handleAddSecondEntry}
                    className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-700 hover:bg-orange-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Second Entry
                  </button>
                ) : null}
              </div>

              {visibleEntries.map((entry, index) => {
                const isLeave = isLeaveLineCategory(entry.category);
                const timeLocked = isLeave && entry.durationMode === "full_day";
                const selectedProject =
                  projects.find((project) => project.id === entry.projectId) ?? null;
                const lineError = lineItemErrors[index];

                return (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Entry {index + 1}
                      </p>
                      {index === 1 ? (
                        <button
                          type="button"
                          onClick={handleRemoveSecondEntry}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor={`entry-project-${entry.id}`}>
                          Client / Project / Site
                        </label>
                        {optionsLoading ? (
                          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                            Loading projects…
                          </div>
                        ) : (
                          <select
                            id={`entry-project-${entry.id}`}
                            value={entry.projectId}
                            onChange={(event) =>
                              updateEntry(entry.id, { projectId: event.target.value })
                            }
                            className={inputClass}
                            disabled={projects.length === 0}
                          >
                            <option value="">Select a project…</option>
                            {projectGroups.map((group) => (
                              <optgroup key={group.client} label={group.client}>
                                {group.projects.map((project) => (
                                  <option key={project.id} value={project.id}>
                                    {formatTimesheetProjectOptionLabel(project)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        )}
                        {selectedProject ? (
                          <p className="mt-1 text-xs text-slate-500">
                            {formatTimesheetProjectDisplayName(selectedProject)}
                          </p>
                        ) : null}
                        {optionsError ? (
                          <p className="mt-1 text-xs text-amber-700">{optionsError}</p>
                        ) : null}
                      </div>

                      <div className="sm:col-span-2">
                        <label className={labelClass} htmlFor={`entry-category-${entry.id}`}>
                          Entry Type / Leave Type
                        </label>
                        <select
                          id={`entry-category-${entry.id}`}
                          value={entry.category}
                          onChange={(event) =>
                            handleCategoryChange(
                              entry.id,
                              event.target.value as TimesheetLineCategory
                            )
                          }
                          className={inputClass}
                        >
                          {TIMESHEET_LINE_CATEGORY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {isLeave ? (
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Duration</label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleDurationModeChange(entry.id, "full_day")
                              }
                              className={cn(
                                "rounded-lg px-3 py-2 text-xs font-semibold ring-1 ring-inset",
                                entry.durationMode === "full_day"
                                  ? "bg-blue-600 text-white ring-blue-600"
                                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                              )}
                            >
                              Full Day (06:30–14:30)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDurationModeChange(entry.id, "partial")
                              }
                              className={cn(
                                "rounded-lg px-3 py-2 text-xs font-semibold ring-1 ring-inset",
                                entry.durationMode === "partial"
                                  ? "bg-blue-600 text-white ring-blue-600"
                                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                              )}
                            >
                              Partial Day
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <label className={labelClass} htmlFor={`entry-start-${entry.id}`}>
                          Start
                        </label>
                        <input
                          id={`entry-start-${entry.id}`}
                          type="time"
                          value={entry.startTime}
                          disabled={timeLocked}
                          onChange={(event) =>
                            updateEntry(entry.id, {
                              startTime: event.target.value.slice(0, 5),
                              durationMode: "partial",
                            })
                          }
                          className={cn(inputClass, timeLocked && "bg-slate-100")}
                        />
                      </div>

                      <div>
                        <label className={labelClass} htmlFor={`entry-end-${entry.id}`}>
                          Finish
                        </label>
                        <input
                          id={`entry-end-${entry.id}`}
                          type="time"
                          value={entry.endTime}
                          disabled={timeLocked}
                          onChange={(event) =>
                            updateEntry(entry.id, {
                              endTime: event.target.value.slice(0, 5),
                              durationMode: "partial",
                            })
                          }
                          className={cn(inputClass, timeLocked && "bg-slate-100")}
                        />
                      </div>

                      {!isLeave ? (
                        <div className="sm:col-span-2">
                          <label
                            className={labelClass}
                            htmlFor={`entry-break-${entry.id}`}
                          >
                            Break (minutes){requiresBreak ? " *" : ""}
                          </label>
                          <input
                            id={`entry-break-${entry.id}`}
                            type="number"
                            min={requiresBreak ? 1 : 0}
                            step={1}
                            required={requiresBreak}
                            value={entry.breakMinutes}
                            onChange={(event) =>
                              updateEntry(entry.id, {
                                breakMinutes: Math.max(
                                  0,
                                  Number(event.target.value) || 0
                                ),
                              })
                            }
                            className={inputClass}
                          />
                          {requiresBreak ? (
                            <p className="mt-1 text-xs font-semibold text-amber-800">
                              {isActWorker
                                ? "A break must be recorded for ACT timesheets."
                                : breakRequiredMessage}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs text-slate-500">
                              Optional for this worker.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {lineError ? (
                      <p className="mt-2 text-sm text-red-600">{lineError}</p>
                    ) : null}
                  </div>
                );
              })}
            </section>

            <div className="grid grid-cols-2 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Work Total</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatTimesheetHoursLabel(totals.workHours)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Leave Total</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatTimesheetHoursLabel(totals.leaveHours)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Break Total</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatTimesheetHoursLabel(totals.breakHours)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Daily Total</p>
                <p className="text-lg font-bold text-blue-700">
                  {formatTimesheetHoursLabel(totals.dailyTotalHours)}
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="shift-notes" className={labelClass}>
                Shift Notes / Work Description
              </label>
              <textarea
                id="shift-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className={cn(inputClass, "resize-y")}
                placeholder="Optional notes about work performed or allowances…"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting…
                  </>
                ) : showSecondEntry ? (
                  "Approve & Submit Dual Entries"
                ) : (
                  "Approve & Submit Timesheet"
                )}
              </button>

              {showViewLink ? (
                <Link
                  href="/accounts/timesheets"
                  className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                >
                  View in Accounts Timesheets →
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
