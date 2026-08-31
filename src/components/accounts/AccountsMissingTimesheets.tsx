"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Phone,
  XCircle,
} from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import Toast from "@/components/ui/Toast";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import { useFormToast } from "@/hooks/useFormToast";
import {
  fetchMissingTimesheetSearch,
  type MissingTimesheetWorkerRow,
} from "@/lib/missing-timesheets";
import {
  getPayWeekRange,
  isCurrentPayWeek,
  listPayWeekOptions,
  resolvePayWeekOption,
  shiftPayWeekStart,
} from "@/lib/pay-week-utils";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type CompletenessFilter = "missing" | "complete" | "all";

export default function AccountsMissingTimesheets() {
  const currentPayWeek = useMemo(() => getPayWeekRange(), []);
  const payWeekOptions = useMemo(
    () => listPayWeekOptions({ pastCount: 26, futureCount: 8 }),
    []
  );
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentPayWeek.startIso);
  const selectedWeek = useMemo(
    () => resolvePayWeekOption(selectedWeekStart),
    [selectedWeekStart]
  );
  const viewingCurrentPayWeek = isCurrentPayWeek(
    selectedWeek.startIso,
    selectedWeek.endIso
  );

  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [completenessFilter, setCompletenessFilter] =
    useState<CompletenessFilter>("missing");
  const [rows, setRows] = useState<MissingTimesheetWorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  useEffect(() => {
    void fetchProjects().then((loaded) => setProjects(loaded ?? []));
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await fetchMissingTimesheetSearch({
      weekStartIso: selectedWeek.startIso,
      projectIds: selectedProjectIds,
    });
    setRows(result.rows ?? []);
    setError(result.error);
    setLoading(false);
  }, [selectedProjectIds, selectedWeek.startIso]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    if (completenessFilter === "complete") {
      return rows.filter((row) => row.is_complete);
    }
    if (completenessFilter === "all") return rows;
    return rows.filter((row) => !row.is_complete);
  }, [completenessFilter, rows]);

  const goToPreviousPayWeek = () => {
    setSelectedWeekStart(shiftPayWeekStart(selectedWeek.startIso, -1));
  };

  const goToNextPayWeek = () => {
    setSelectedWeekStart(shiftPayWeekStart(selectedWeek.startIso, 1));
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  };

  const handleSendReminder = async (row: MissingTimesheetWorkerRow) => {
    if (!row.worker_id || row.missing_day_names.length === 0) return;
    setSendingId(row.worker_id);
    try {
      const response = await fetch("/api/accounts/missing-timesheets/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker_id: row.worker_id,
          worker_name: row.worker_name,
          missing_day_names: row.missing_day_names,
          project_ids: row.project_ids,
          pay_week_start: selectedWeek.startIso,
          pay_week_end: selectedWeek.endIso,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !payload.success) {
        showError(payload.error ?? "Failed to send reminder.");
        return;
      }
      showSuccess(payload.message ?? `Reminder sent to ${row.worker_name}`);
    } catch (sendError) {
      showError(
        sendError instanceof Error ? sendError.message : "Failed to send reminder."
      );
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <AccountsNav />

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}

      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Accounts <span className="text-orange-500">Missing Timesheet Search</span>
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Check Wed–Tue working days (Sunday excluded) and remind workers who are
          missing a submitted timesheet.
        </p>
      </div>

      <div className={cn(cardClass, "space-y-4 p-4")}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[240px] flex-1">
            <p className={labelClass}>Pay Week (Wed–Tue)</p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {selectedWeek.label}
              {viewingCurrentPayWeek ? (
                <span className="ml-2 text-sm font-medium text-blue-700">Current</span>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={goToPreviousPayWeek}
              aria-label="Previous pay week"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous Week
            </button>
            <button
              type="button"
              onClick={() => setSelectedWeekStart(currentPayWeek.startIso)}
              disabled={viewingCurrentPayWeek}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                viewingCurrentPayWeek
                  ? "cursor-default bg-blue-600 text-white opacity-80"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              Current Week
            </button>
            <button
              type="button"
              onClick={goToNextPayWeek}
              aria-label="Next pay week"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Next Week
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="min-w-[260px] flex-1">
            <label htmlFor="missing-pay-week-select" className={labelClass}>
              Jump to Week
            </label>
            <select
              id="missing-pay-week-select"
              value={selectedWeek.startIso}
              onChange={(event) => setSelectedWeekStart(event.target.value)}
              className={inputClass}
            >
              {payWeekOptions.map((option) => (
                <option key={option.startIso} value={option.startIso}>
                  {option.label}
                  {isCurrentPayWeek(option.startIso, option.endIso) ? " (Current)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className={labelClass}>Projects</p>
            <div className="mt-1 max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={selectedProjectIds.length === 0}
                  onChange={() => setSelectedProjectIds([])}
                />
                All active projects
              </label>
              {(projects ?? []).map((project) => (
                <label
                  key={project.id}
                  className="flex items-center gap-2 text-sm text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.includes(project.id)}
                    onChange={() => toggleProject(project.id)}
                  />
                  <span className="truncate">{project.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className={labelClass}>Show</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {(
                [
                  ["missing", "Missing"],
                  ["complete", "Complete"],
                  ["all", "All workers"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCompletenessFilter(value)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm font-semibold",
                    completenessFilter === value
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-orange-50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {visibleRows.length} worker{visibleRows.length === 1 ? "" : "s"} in this
              view.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Checking timesheets for {selectedWeek.label}…
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {completenessFilter === "missing"
            ? "No workers are missing timesheets for this pay week."
            : "No workers match the selected filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Worker</th>
                {visibleRows[0]?.days.map((day) => (
                  <th key={day.shortLabel} className="px-3 py-3 text-center">
                    {day.shortLabel}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.worker_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <WorkerProfileAvatar
                        photoUrl={row.photo_url}
                        displayName={row.worker_name}
                        size="sm"
                        enableLightbox={false}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{row.worker_name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {row.worker_trade ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              {row.worker_trade}
                            </span>
                          ) : null}
                          {(row.project_names ?? []).slice(0, 2).map((name) => (
                            <span
                              key={name}
                              className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  {(row.days ?? []).map((day) => (
                    <td key={`${row.worker_id}-${day.iso}`} className="px-3 py-3 text-center">
                      {day.status === "submitted" ? (
                        <CheckCircle2
                          className="mx-auto h-5 w-5 text-emerald-500"
                          aria-label={`${day.fullLabel} submitted`}
                        />
                      ) : (
                        <XCircle
                          className="mx-auto h-5 w-5 text-red-500"
                          aria-label={`${day.fullLabel} missing`}
                        />
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    {row.is_complete ? (
                      <span className="text-xs font-semibold text-emerald-700">Complete</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSendReminder(row)}
                        disabled={sendingId === row.worker_id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {sendingId === row.worker_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <Bell className="h-3.5 w-3.5" />
                            <Phone className="h-3.5 w-3.5" />
                          </>
                        )}
                        Send Notification
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
