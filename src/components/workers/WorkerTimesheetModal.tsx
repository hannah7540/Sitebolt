"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import type { Worker, WorkerTimesheet } from "@/lib/supabase";
import {
  fetchTimesheetFormOptions,
  formatTimesheetProjectDisplayName,
  groupTimesheetProjectsByClient,
  type TimesheetProject,
  type TimesheetTask,
} from "@/lib/timesheet-options";
import {
  createDefaultBreakSlot,
  calculateDailyTotalsFromSlots,
  formatTimesheetHours,
  formatTimesheetHoursLabel,
  formatTimeDisplay,
  localIsoDate,
  addDaysToIsoDate,
  isAdvanceTimesheetDate,
  TIMESHEET_MAX_ADVANCE_DAYS,
  validateBreakSlot,
  validateTimesheetWorkDate,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "@/lib/timesheet-utils";
import {
  DEFAULT_TIMESHEET_END_TIME,
  DEFAULT_TIMESHEET_START_TIME,
  TIMESHEET_LINE_CATEGORY_OPTIONS,
  createChainedLineItem,
  createDefaultLineItem,
  hasWorkLineItems,
  isLeaveLineCategory,
  migrateActivityToLineItem,
  resolveLineItemNetWorkHours,
  resolveLineItemSegmentHours,
  syncLineItemFields,
  validateLineItemSlot,
  type TimesheetDurationMode,
  type TimesheetLineCategory,
} from "@/lib/timesheet-line-items";
import {
  isActWorkerState,
  validateActBreakRequirement,
} from "@/lib/timesheet-act-break-validation";
import {
  getPayWeekRange,
  formatPayWeekRange,
} from "@/lib/pay-week-utils";
import {
  getTodayTimesheetEntry,
  saveWorkerTimesheetEntry,
  sumPayWeekDailyHours,
} from "@/lib/timesheet-entries";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import TimesheetAdvanceEntryBadge from "@/components/workers/TimesheetAdvanceEntryBadge";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerTimesheetModalProps {
  worker: Worker;
  projectId?: string | null;
  allowedProjectIds?: string[];
  timesheets?: WorkerTimesheet[];
  onClose: () => void;
  onSaved?: () => void;
  onSubmitted?: () => void;
}

function resolveWorkerTrade(worker: Worker): string {
  return (
    worker.trade?.trim() ||
    (worker as { trade_role?: string | null }).trade_role?.trim() ||
    "—"
  );
}

export default function WorkerTimesheetModal({
  worker,
  projectId: initialProjectId,
  allowedProjectIds,
  timesheets = [],
  onClose,
  onSaved,
  onSubmitted,
}: WorkerTimesheetModalProps) {
  const todayIso = localIsoDate();
  const maxAdvanceDateIso = useMemo(
    () => addDaysToIsoDate(todayIso, TIMESHEET_MAX_ADVANCE_DAYS),
    [todayIso]
  );
  const payWeek = useMemo(() => getPayWeekRange(new Date()), []);
  const initialEntry = useMemo(
    () => getTodayTimesheetEntry(timesheets, todayIso),
    [timesheets, todayIso]
  );

  const [workDate, setWorkDate] = useState(todayIso);
  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [tasks, setTasks] = useState<TimesheetTask[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const entryForSelectedDate = useMemo(
    () => getTodayTimesheetEntry(timesheets, workDate),
    [timesheets, workDate]
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId ?? initialEntry?.project_id ?? worker.assigned_project_id ?? null
  );
  const [activities, setActivities] = useState<TimesheetActivitySlot[]>(
    initialEntry?.activities?.length
      ? initialEntry.activities.map(migrateActivityToLineItem)
      : [createDefaultLineItem("work")]
  );
  const [breaks, setBreaks] = useState<TimesheetBreakSlot[]>(
    initialEntry?.breaks ?? []
  );
  const [notes, setNotes] = useState(initialEntry?.notes ?? "");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [breakSectionError, setBreakSectionError] = useState<string | null>(null);

  const loadTimesheetOptions = useCallback(async () => {
    setOptionsLoading(true);
    setOptionsError(null);

    const result = await fetchTimesheetFormOptions();

    setProjects(result.projects);
    setTasks(result.tasks);

    if (result.error) {
      setOptionsError(result.error);
    } else if (result.projects.length === 0 || result.tasks.length === 0) {
      setOptionsError(
        result.projects.length === 0 && result.tasks.length === 0
          ? "No active projects or tasks were returned from Supabase. Check row data and public SELECT policies, then click Retry."
          : result.projects.length === 0
            ? "No active projects were returned. Add projects under Organisation → Projects (or configure timesheet_projects), then click Retry."
            : "No active tasks were returned from Supabase. Ensure timesheet_tasks rows have a name and is_active = true, then click Retry."
      );
    } else {
      setOptionsError(null);
    }

    setOptionsLoading(false);
  }, []);

  useEffect(() => {
    void loadTimesheetOptions();
  }, [loadTimesheetOptions]);

  useEffect(() => {
    const entry = getTodayTimesheetEntry(timesheets, workDate);
    if (!entry) return;
    setProjectId(entry.project_id);
    setSelectedProjectId(entry.project_id ?? "");
    setActivities(
      entry.activities?.length
        ? entry.activities.map(migrateActivityToLineItem)
        : [createDefaultLineItem("work")]
    );
    setBreaks(entry.breaks ?? []);
    setNotes(entry.notes ?? "");

    const matchedTask = tasks.find(
      (task) => task.name.toLowerCase() === String(entry.worker_trade ?? "").toLowerCase()
    );
    if (matchedTask) {
      setSelectedTaskId(matchedTask.id);
    }
  }, [workDate, timesheets, tasks]);

  useEffect(() => {
    if (selectedProjectId || projects.length === 0) return;

    const savedProjectId = entryForSelectedDate?.project_id;
    if (savedProjectId && projects.some((project) => project.id === savedProjectId)) {
      setSelectedProjectId(savedProjectId);
      setProjectId(savedProjectId);
    }
  }, [selectedProjectId, projects, entryForSelectedDate?.project_id]);

  const projectGroups = useMemo(
    () => groupTimesheetProjectsByClient(projects),
    [projects]
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId]
  );

  const totals = useMemo(
    () => calculateDailyTotalsFromSlots(activities, breaks),
    [activities, breaks]
  );

  const weeklyTotal = useMemo(
    () => sumPayWeekDailyHours(timesheets, payWeek.startIso, payWeek.endIso),
    [timesheets, payWeek.startIso, payWeek.endIso]
  );

  const todayTotal = useMemo(() => {
    const entry = timesheets.find((row) => row.work_date === todayIso);
    if (workDate === todayIso) {
      return totals.dailyTotalHours;
    }
    return Number(entry?.daily_total_hours ?? entry?.total_hours ?? 0);
  }, [timesheets, todayIso, workDate, totals.dailyTotalHours]);

  const workerTrade = selectedTask?.name ?? resolveWorkerTrade(worker);
  const isNewEntry = !entryForSelectedDate;
  const isActWorker = isActWorkerState(worker.state);
  const showBreakSection = hasWorkLineItems(activities);

  const breakErrors = useMemo(
    () =>
      breaks.map((row) => validateBreakSlot(row.startTime, row.endTime)),
    [breaks]
  );

  const lineItemErrors = useMemo(
    () => activities.map((row) => validateLineItemSlot(row)),
    [activities]
  );

  const updateLineItem = (
    id: string,
    updates: Partial<TimesheetActivitySlot>
  ) => {
    setActivities((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row;
        return syncLineItemFields({ ...row, ...updates });
      })
    );
  };

  const handleCategoryChange = (id: string, category: TimesheetLineCategory) => {
    const current = activities.find((row) => row.id === id);
    if (!current) return;

    if (isLeaveLineCategory(category) && activities.length === 1) {
      updateLineItem(id, {
        category,
        durationMode: "full_day",
        startTime: DEFAULT_TIMESHEET_START_TIME,
        endTime: DEFAULT_TIMESHEET_END_TIME,
      });
      return;
    }

    updateLineItem(id, {
      category,
      durationMode: "partial",
      startTime: current.startTime,
      endTime: current.endTime,
    });
  };

  const handleDurationModeChange = (
    id: string,
    durationMode: TimesheetDurationMode
  ) => {
    if (durationMode === "full_day") {
      updateLineItem(id, {
        durationMode,
        startTime: DEFAULT_TIMESHEET_START_TIME,
        endTime: DEFAULT_TIMESHEET_END_TIME,
      });
      return;
    }

    updateLineItem(id, { durationMode });
  };

  const handleLineItemTimeChange = (
    id: string,
    field: "startTime" | "endTime",
    value: string
  ) => {
    updateLineItem(id, {
      [field]: value,
      durationMode: "partial",
    });
  };

  const handleAddEntry = () => {
    setActivities((rows) => {
      const last = rows[rows.length - 1];
      return [...rows, createChainedLineItem(last, "work")];
    });
  };

  const updateBreak = (id: string, field: keyof TimesheetBreakSlot, value: string) => {
    setBreaks((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async (submit: boolean) => {
    setError(null);
    setBreakSectionError(null);

    if (!selectedProject) {
      setError("Please select a client project.");
      return;
    }

    if (!selectedTask) {
      setError("Please select a work task.");
      return;
    }

    const workDateError = validateTimesheetWorkDate(workDate);
    if (workDateError) {
      setError(workDateError);
      return;
    }

    if (lineItemErrors.some(Boolean)) {
      setError("Fix entry start/finish times before saving.");
      return;
    }

    if (breaks.some((_, index) => breakErrors[index])) {
      setError("Fix break durations before saving.");
      return;
    }

    if (submit) {
      const actBreakError = validateActBreakRequirement({
        workerState: worker.state,
        submit: true,
        breaks,
        breakMinutes: Math.round(totals.breakHours * 60),
        breakHours: totals.breakHours,
        notes,
        activities,
      });
      if (actBreakError) {
        setBreakSectionError(actBreakError);
        setError(actBreakError);
        return;
      }
    }

    setSaving(submit ? "submit" : "draft");
    try {
      const result = await saveWorkerTimesheetEntry({
        workerId: worker.id,
        workDate,
        projectId: selectedProject.id,
        timesheetProject: selectedProject,
        timesheetTaskName: selectedTask.name,
        workerTrade,
        activities: activities.map(syncLineItemFields),
        breaks,
        notes,
        workerState: worker.state ?? null,
        signatureDataUrl: submit ? signature : null,
        submit,
        existingId: entryForSelectedDate?.id ?? null,
      });

      if (result.error || !result.data) {
        setError(result.error ?? "Failed to save timesheet.");
        return;
      }

      onSaved?.();
      onSubmitted?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save timesheet.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-h-[92vh] w-full max-w-3xl overflow-y-auto p-0")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {isNewEntry ? "Add New Timesheet" : "Timesheet"}
              </h2>
              <p className="text-xs text-slate-500">
                Pay week: {formatPayWeekRange(payWeek.start, payWeek.end)}
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-500">Today&apos;s Work Total</p>
                <p className="text-lg font-bold text-slate-900">
                  {formatTimesheetHoursLabel(todayTotal)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Weekly Work Total</p>
                <p className="text-lg font-bold text-blue-700">
                  {formatTimesheetHoursLabel(weeklyTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="timesheet-project" className={labelClass}>
                Client / Project
              </label>
              {optionsLoading ? (
                <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  Loading projects…
                </div>
              ) : (
                <select
                  id="timesheet-project"
                  value={selectedProjectId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedProjectId(nextId);
                    setProjectId(nextId || null);
                  }}
                  className={inputClass}
                  disabled={projects.length === 0}
                >
                  <option value="">Select a project…</option>
                  {projectGroups.map((group) => (
                    <optgroup key={group.client} label={group.client}>
                      {group.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.project}
                          {project.address ? ` — ${project.address}` : ""}
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

            <div>
              <label htmlFor="timesheet-date" className={labelClass}>
                Date
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="timesheet-date"
                  type="date"
                  value={workDate}
                  max={maxAdvanceDateIso}
                  onChange={(event) => setWorkDate(event.target.value)}
                  className={inputClass}
                />
                {isAdvanceTimesheetDate(workDate, todayIso) ? (
                  <TimesheetAdvanceEntryBadge />
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Submit up to {TIMESHEET_MAX_ADVANCE_DAYS} days in advance.
              </p>
            </div>
          </div>

          {optionsError ? (
            <div className="mx-6 -mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span>{optionsError}</span>
              <button
                type="button"
                onClick={() => void loadTimesheetOptions()}
                disabled={optionsLoading}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                {optionsLoading ? "Retrying…" : "Retry"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-5 px-6 py-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Daily Entries
              </h3>
              <button
                type="button"
                onClick={handleAddEntry}
                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-700 hover:bg-orange-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Entry
              </button>
            </div>

            {activities.map((row, index) => {
              const synced = syncLineItemFields(row);
              const category = synced.category ?? "work";
              const isLeave = isLeaveLineCategory(category);
              const durationMode = synced.durationMode ?? "partial";
              const segmentHours = resolveLineItemSegmentHours(synced);
              const paidWorkHours = resolveLineItemNetWorkHours(
                synced,
                activities.map(syncLineItemFields),
                totals.breakHours
              );
              const timeLocked = isLeave && durationMode === "full_day";
              const lineError = lineItemErrors[index];

              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Entry {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setActivities((rows) =>
                          rows.length <= 1 ? rows : rows.filter((item) => item.id !== row.id)
                        )
                      }
                      disabled={activities.length <= 1}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Category</label>
                      <select
                        value={category}
                        onChange={(event) =>
                          handleCategoryChange(
                            row.id,
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
                            onClick={() => handleDurationModeChange(row.id, "full_day")}
                            className={cn(
                              "rounded-lg px-3 py-2 text-xs font-semibold ring-1 ring-inset",
                              durationMode === "full_day"
                                ? "bg-blue-600 text-white ring-blue-600"
                                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                            )}
                          >
                            Full Day (06:30–14:30)
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDurationModeChange(row.id, "partial")}
                            className={cn(
                              "rounded-lg px-3 py-2 text-xs font-semibold ring-1 ring-inset",
                              durationMode === "partial"
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
                      <label className={labelClass}>Start</label>
                      <input
                        type="time"
                        value={synced.startTime}
                        disabled={timeLocked}
                        onChange={(event) =>
                          handleLineItemTimeChange(row.id, "startTime", event.target.value)
                        }
                        className={cn(inputClass, timeLocked && "bg-slate-100")}
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {formatTimeDisplay(synced.startTime)}
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Finish</label>
                      <input
                        type="time"
                        value={synced.endTime}
                        disabled={timeLocked}
                        onChange={(event) =>
                          handleLineItemTimeChange(row.id, "endTime", event.target.value)
                        }
                        className={cn(inputClass, timeLocked && "bg-slate-100")}
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {formatTimeDisplay(synced.endTime)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    {formatTimesheetHours(segmentHours)} calculated
                    {category === "work" &&
                    paidWorkHours !== segmentHours &&
                    totals.breakHours > 0 ? (
                      <span className="font-normal text-slate-500">
                        {" "}
                        · {formatTimesheetHours(paidWorkHours)} after breaks
                      </span>
                    ) : null}
                  </p>
                  {lineError ? (
                    <p className="mt-1 text-sm text-red-600">{lineError}</p>
                  ) : null}
                </div>
              );
            })}
          </section>

          {showBreakSection ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Breaks
              </h3>
              <button
                type="button"
                onClick={() => {
                  setBreaks((rows) => [...rows, createDefaultBreakSlot()]);
                  setBreakSectionError(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Break
              </button>
            </div>

            {isActWorker ? (
              <p className="text-xs text-slate-500">
                ACT workers must record at least one break for work shifts.
              </p>
            ) : null}

            {breakSectionError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {breakSectionError}
              </p>
            ) : null}

            {breaks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No breaks added.
              </p>
            ) : (
              breaks.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Break {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setBreaks((rows) => rows.filter((item) => item.id !== row.id))
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Start</label>
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(event) =>
                          updateBreak(row.id, "startTime", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Finish</label>
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(event) =>
                          updateBreak(row.id, "endTime", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  {breakErrors[index] ? (
                    <p className="mt-2 text-sm text-red-600">{breakErrors[index]}</p>
                  ) : null}
                </div>
              ))
            )}
          </section>
          ) : null}

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Work Total</p>
              <p className="text-lg font-bold text-slate-900">
                {formatTimesheetHoursLabel(
                  Math.max(0, totals.workHours - totals.breakHours)
                )}
              </p>
              {totals.breakHours > 0 ? (
                <p className="text-[11px] text-slate-500">
                  {formatTimesheetHoursLabel(totals.workHours)} before breaks
                </p>
              ) : null}
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
            <label htmlFor="timesheet-notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="timesheet-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Optional notes…"
            />
          </div>

          <div>
            <p className={labelClass}>Worker Signature</p>
            <SignatureCanvas onChange={(value) => setSignature(value ?? "")} />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void handleSave(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {saving === "draft" ? (
                <Loader2 className="inline h-4 w-4 animate-spin" />
              ) : null}{" "}
              Save
            </button>
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void handleSave(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign and Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
