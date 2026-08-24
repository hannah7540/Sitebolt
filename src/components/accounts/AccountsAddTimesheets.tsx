"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Search, UserRound } from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { fetchAllWorkers, type Worker } from "@/lib/supabase";
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
  validateTimesheetWorkDate,
} from "@/lib/timesheet-utils";
import {
  createDefaultLineItem,
  isLeaveLineCategory,
  syncLineItemFields,
  TIMESHEET_LINE_CATEGORY_OPTIONS,
  type TimesheetLineCategory,
} from "@/lib/timesheet-line-items";
import { resolvePayRuleTemplateNameForWorker } from "@/lib/worker-pay-rule-assignment";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function isActiveWorker(worker: Worker): boolean {
  return worker.status !== "Revoked" && !worker.is_revoked && !worker.is_archived;
}

function resolveWorkerTrade(worker: Worker): string {
  return (
    worker.trade?.trim() ||
    (worker as { trade_role?: string | null }).trade_role?.trim() ||
    "—"
  );
}

export default function AccountsAddTimesheets() {
  const todayIso = localIsoDate();
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const workerDropdownRef = useRef<HTMLDivElement>(null);

  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [tasks, setTasks] = useState<TimesheetTask[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [workDate, setWorkDate] = useState(todayIso);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [startTime, setStartTime] = useState("06:30");
  const [endTime, setEndTime] = useState("14:30");
  const [entryCategory, setEntryCategory] = useState<TimesheetLineCategory>("work");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [notes, setNotes] = useState("");
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        workerDropdownRef.current &&
        !workerDropdownRef.current.contains(event.target as Node)
      ) {
        setWorkerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.id === selectedWorkerId) ?? null,
    [workers, selectedWorkerId]
  );

  const filteredWorkers = useMemo(() => {
    const needle = workerSearch.trim().toLowerCase();
    let list = workers;

    if (needle) {
      list = list.filter((worker) => {
        const name = getWorkerDisplayName(worker).toLowerCase();
        const email = worker.email?.toLowerCase() ?? "";
        const phone = worker.phone?.toLowerCase() ?? "";
        return (
          name.includes(needle) ||
          email.includes(needle) ||
          phone.includes(needle) ||
          worker.full_name.toLowerCase().includes(needle)
        );
      });
    }

    return list.sort((a, b) =>
      getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b))
    );
  }, [workers, workerSearch]);

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

  const activities = useMemo(() => {
    const isLeave = isLeaveLineCategory(entryCategory);
    return [
      syncLineItemFields({
        ...createDefaultLineItem(entryCategory),
        startTime: isLeave ? "06:30" : startTime,
        endTime: isLeave ? "14:30" : endTime,
        durationMode: isLeave ? "full_day" : "partial",
      }),
    ];
  }, [startTime, endTime, entryCategory]);

  const isLeaveEntry = isLeaveLineCategory(entryCategory);

  const totals = useMemo(() => {
    const base = calculateDailyTotalsFromSlots(activities, []);
    if (isLeaveEntry || breakMinutes <= 0) return base;
    const breakHours = Math.round((breakMinutes / 60) * 100) / 100;
    return {
      ...base,
      breakHours,
      dailyTotalHours: Math.max(
        0,
        Math.round((base.workHours - breakHours + base.leaveHours) * 100) / 100
      ),
    };
  }, [activities, breakMinutes, isLeaveEntry]);

  const payRuleLabel = useMemo(() => {
    if (!selectedWorker) return "—";
    return resolvePayRuleTemplateNameForWorker(selectedWorker.state) ?? "—";
  }, [selectedWorker]);

  const resetForm = () => {
    setWorkDate(todayIso);
    setSelectedProjectId("");
    setSelectedTaskId("");
    setStartTime("06:30");
    setEndTime("14:30");
    setEntryCategory("work");
    setBreakMinutes(0);
    setNotes("");
  };

  const handleSelectWorker = (worker: Worker) => {
    setSelectedWorkerId(worker.id);
    setWorkerSearch(getWorkerDisplayName(worker));
    setWorkerDropdownOpen(false);
    setShowViewLink(false);

    if (worker.assigned_project_id && projects.some((p) => p.id === worker.assigned_project_id)) {
      setSelectedProjectId(worker.assigned_project_id);
    }

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

    if (!selectedProject) {
      showError("Please select a project.");
      return;
    }

    const dateError = validateTimesheetWorkDate(workDate);
    if (dateError) {
      showError(dateError);
      return;
    }

    if (totals.dailyTotalHours <= 0) {
      showError("Daily total must be greater than 0 hours.");
      return;
    }

    setSubmitting(true);
    setShowViewLink(false);

    try {
      const response = await fetch("/api/accounts/timesheets/approve-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: selectedWorker.id,
          workDate,
          projectId: selectedProject.id,
          timesheetProject: selectedProject,
          timesheetTaskName: selectedTask?.name ?? resolveWorkerTrade(selectedWorker),
          workerTrade: selectedTask?.name ?? resolveWorkerTrade(selectedWorker),
          workerState: selectedWorker.state ?? null,
          breakMinutes,
          notes: notes.trim() || null,
          activities: activities.map((row) => ({
            id: row.id,
            startTime: row.startTime,
            endTime: row.endTime,
            label: row.label,
            category: row.category,
          })),
          breaks: [],
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        workerName?: string;
      } | null;

      if (!response.ok) {
        showError(payload?.error ?? "Failed to submit timesheet.");
        return;
      }

      const workerName =
        payload?.workerName ?? getWorkerDisplayName(selectedWorker);
      showSuccess(`Timesheet submitted and approved for ${workerName}.`);
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
          Submit and approve timesheets on behalf of workers. Approved entries appear
          immediately in Accounts Timesheets.
        </p>
      </div>

      <div className={cn(cardClass, "space-y-6 p-6")}>
        <div ref={workerDropdownRef} className="relative">
          <label htmlFor="worker-search" className={labelClass}>
            Select Worker
          </label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="worker-search"
              type="text"
              value={workerSearch}
              onChange={(event) => {
                setWorkerSearch(event.target.value);
                setWorkerDropdownOpen(true);
                if (!event.target.value.trim()) {
                  setSelectedWorkerId("");
                }
              }}
              onFocus={() => setWorkerDropdownOpen(true)}
              placeholder="Search by name, email, or mobile…"
              className={cn(inputClass, "pl-9 pr-9")}
              autoComplete="off"
            />
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>

          {workerDropdownOpen ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {workersLoading ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  Loading workers…
                </div>
              ) : filteredWorkers.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-500">No workers found.</p>
              ) : (
                filteredWorkers.map((worker) => (
                  <button
                    key={worker.id}
                    type="button"
                    onClick={() => handleSelectWorker(worker)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-orange-50",
                      selectedWorkerId === worker.id && "bg-orange-50"
                    )}
                  >
                    <span className="font-medium text-slate-900">
                      {getWorkerDisplayName(worker)}
                    </span>
                    <span className="text-xs text-slate-500">
                      {[worker.email, worker.phone].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

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

              <div className="sm:col-span-2">
                <label htmlFor="timesheet-project" className={labelClass}>
                  Client / Project / Site
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
                    onChange={(event) => setSelectedProjectId(event.target.value)}
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

              <div className="sm:col-span-2">
                <label htmlFor="entry-category" className={labelClass}>
                  Entry Type
                </label>
                <select
                  id="entry-category"
                  value={entryCategory}
                  onChange={(event) => {
                    const category = event.target.value as TimesheetLineCategory;
                    setEntryCategory(category);
                    if (isLeaveLineCategory(category)) {
                      setStartTime("06:30");
                      setEndTime("14:30");
                      setBreakMinutes(0);
                    }
                  }}
                  className={inputClass}
                >
                  {TIMESHEET_LINE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="start-time" className={labelClass}>
                  Start Time
                </label>
                <input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value.slice(0, 5))}
                  className={inputClass}
                  disabled={isLeaveEntry}
                />
              </div>

              <div>
                <label htmlFor="end-time" className={labelClass}>
                  End Time
                </label>
                <input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value.slice(0, 5))}
                  className={inputClass}
                  disabled={isLeaveEntry}
                />
              </div>

              {!isLeaveEntry ? (
              <div>
                <label htmlFor="break-minutes" className={labelClass}>
                  Break (minutes)
                </label>
                <input
                  id="break-minutes"
                  type="number"
                  min={0}
                  step={1}
                  value={breakMinutes}
                  onChange={(event) =>
                    setBreakMinutes(Math.max(0, Number(event.target.value) || 0))
                  }
                  className={inputClass}
                />
              </div>
              ) : null}

              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Shift Hours
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatTimesheetHoursLabel(totals.dailyTotalHours)}
                </p>
                <p className="text-xs text-slate-500">
                  {isLeaveEntry ? (
                    <>Leave {formatTimesheetHoursLabel(totals.leaveHours)}</>
                  ) : (
                    <>
                      Work {formatTimesheetHoursLabel(totals.workHours)} · Break{" "}
                      {formatTimesheetHoursLabel(totals.breakHours)}
                    </>
                  )}
                </p>
              </div>

              <div className="sm:col-span-2">
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
