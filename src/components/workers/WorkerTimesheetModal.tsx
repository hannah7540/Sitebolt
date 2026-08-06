"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import type { Worker, WorkerTimesheet } from "@/lib/supabase";
import { getProjectDisplayName } from "@/lib/project-resolver";
import {
  createDefaultActivitySlot,
  createDefaultBreakSlot,
  calculateDailyTotalsFromSlots,
  calculateSlotMinutes,
  minutesToHours,
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
  const entryForSelectedDate = useMemo(
    () => getTodayTimesheetEntry(timesheets, workDate),
    [timesheets, workDate]
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId ?? initialEntry?.project_id ?? worker.assigned_project_id ?? null
  );
  const [activities, setActivities] = useState<TimesheetActivitySlot[]>(
    initialEntry?.activities?.length
      ? initialEntry.activities
      : [createDefaultActivitySlot()]
  );
  const [breaks, setBreaks] = useState<TimesheetBreakSlot[]>(
    initialEntry?.breaks ?? []
  );
  const [notes, setNotes] = useState(initialEntry?.notes ?? "");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const entry = getTodayTimesheetEntry(timesheets, workDate);
    if (!entry) return;
    setProjectId(entry.project_id);
    setActivities(entry.activities?.length ? entry.activities : [createDefaultActivitySlot()]);
    setBreaks(entry.breaks ?? []);
    setNotes(entry.notes ?? "");
  }, [workDate, timesheets]);

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

  const projectName = projectId ? getProjectDisplayName(projectId) : "—";
  const workerTrade = resolveWorkerTrade(worker);

  const breakErrors = useMemo(
    () =>
      breaks.map((row) => validateBreakSlot(row.startTime, row.endTime)),
    [breaks]
  );

  const updateActivity = (
    id: string,
    field: keyof TimesheetActivitySlot,
    value: string
  ) => {
    setActivities((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const updateBreak = (id: string, field: keyof TimesheetBreakSlot, value: string) => {
    setBreaks((rows) =>
      rows.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async (submit: boolean) => {
    setError(null);

    if (!projectId) {
      setError("Please select a project.");
      return;
    }

    const workDateError = validateTimesheetWorkDate(workDate);
    if (workDateError) {
      setError(workDateError);
      return;
    }

    if (breaks.some((_, index) => breakErrors[index])) {
      setError("Fix break durations before saving.");
      return;
    }

    setSaving(submit ? "submit" : "draft");
    try {
      const result = await saveWorkerTimesheetEntry({
        workerId: worker.id,
        workDate,
        projectId,
        workerTrade,
        activities,
        breaks,
        notes,
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
              <h2 className="text-lg font-bold text-slate-900">Timesheet</h2>
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

          <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
            <div>
              <p className={labelClass}>Project</p>
              <p className="text-sm font-semibold text-slate-900">{projectName}</p>
            </div>
            <div>
              <p className={labelClass}>Trade</p>
              <p className="text-sm font-semibold text-slate-900">{workerTrade}</p>
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
        </div>

        <div className="space-y-5 px-6 py-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Activities
              </h3>
              <button
                type="button"
                onClick={() => setActivities((rows) => [...rows, createDefaultActivitySlot()])}
                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-orange-700 hover:bg-orange-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Activity
              </button>
            </div>

            {activities.map((row, index) => {
              const activityHours = minutesToHours(
                calculateSlotMinutes(row.startTime, row.endTime)
              );
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">
                      Activity {index + 1}
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
                    <div>
                      <label className={labelClass}>Start</label>
                      <input
                        type="time"
                        value={row.startTime}
                        onChange={(event) =>
                          updateActivity(row.id, "startTime", event.target.value)
                        }
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {formatTimeDisplay(row.startTime)}
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Finish</label>
                      <input
                        type="time"
                        value={row.endTime}
                        onChange={(event) =>
                          updateActivity(row.id, "endTime", event.target.value)
                        }
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-400">
                        {formatTimeDisplay(row.endTime)}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Description</label>
                      <input
                        type="text"
                        value={row.label}
                        onChange={(event) =>
                          updateActivity(row.id, "label", event.target.value.toUpperCase())
                        }
                        className={inputClass}
                        placeholder="WORKING ON SITE"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-600">
                    {formatTimesheetHours(activityHours)} total
                  </p>
                </div>
              );
            })}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                Breaks
              </h3>
              <button
                type="button"
                onClick={() => setBreaks((rows) => [...rows, createDefaultBreakSlot()])}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5" />
                Break
              </button>
            </div>

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

          <div className="grid grid-cols-3 gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div>
              <p className="text-xs text-slate-500">Work Total</p>
              <p className="text-lg font-bold text-slate-900">
                {formatTimesheetHoursLabel(totals.workHours)}
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
