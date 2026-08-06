"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eye, Loader2, X } from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import Toast from "@/components/ui/Toast";
import { useAdminConsoleOptional } from "@/contexts/AdminConsoleContext";
import { useFormToast } from "@/hooks/useFormToast";
import {
  approvalStatusMeta,
  approveAccountsTimesheets,
  downloadPayrollTimesheetCsv,
  fetchAccountsTimesheets,
  formatTimesheetDatePeriod,
  type AccountsTimesheetRow,
} from "@/lib/accounts-timesheets";
import {
  formatTimesheetHours,
  timesheetStatusMeta,
  isTimesheetApproved,
  isAdvanceTimesheetDate,
} from "@/lib/timesheet-utils";
import TimesheetAdvanceEntryBadge from "@/components/workers/TimesheetAdvanceEntryBadge";
import TimesheetLeaveEntryBadge from "@/components/workers/TimesheetLeaveEntryBadge";
import TimesheetPayBreakdownPanel from "@/components/accounts/TimesheetPayBreakdownPanel";
import { resolveLeaveTimesheetDisplay } from "@/lib/leave-timesheet-rules";
import {
  fetchPayRatesAndRules,
  type PayRateRule,
} from "@/lib/pay-rates-and-rules";
import {
  getPayWeekRange,
  isCurrentPayWeek,
  isDateInPayWeek,
  listPayWeekOptions,
} from "@/lib/pay-week-utils";
import { type AccountsAccessRole } from "@/lib/security-roles";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AccountsTimesheetsTabProps {
  accountsAccessRole: AccountsAccessRole;
}

function isTimesheetSelectable(row: AccountsTimesheetRow): boolean {
  return !isTimesheetApproved(row.status);
}

export default function AccountsTimesheetsTab({
  accountsAccessRole,
}: AccountsTimesheetsTabProps) {
  const adminConsole = useAdminConsoleOptional();
  const payWeekOptions = useMemo(() => listPayWeekOptions(20), []);
  const currentPayWeek = useMemo(() => getPayWeekRange(new Date()), []);

  const [rows, setRows] = useState<AccountsTimesheetRow[]>([]);
  const [payRules, setPayRules] = useState<PayRateRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentPayWeek.startIso);
  const [currentWeekOnly, setCurrentWeekOnly] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [detailTarget, setDetailTarget] = useState<AccountsTimesheetRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<string[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const loadRows = useCallback(async () => {
    setLoading(true);
    const [data, rulesResult] = await Promise.all([
      fetchAccountsTimesheets(),
      fetchPayRatesAndRules(),
    ]);
    setRows(data);
    setPayRules(rulesResult.rules);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const selectedWeek = useMemo(
    () =>
      payWeekOptions.find((option) => option.startIso === selectedWeekStart) ??
      payWeekOptions[0]!,
    [payWeekOptions, selectedWeekStart]
  );

  const projectOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      if (row.project_name?.trim()) names.add(row.project_name.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const payRuleById = useMemo(() => {
    const map = new Map<string, PayRateRule>();
    for (const rule of payRules) {
      map.set(rule.id, rule);
    }
    return map;
  }, [payRules]);

  const detailPayRule = useMemo(() => {
    if (!detailTarget?.pay_rate_id) return null;
    return payRuleById.get(detailTarget.pay_rate_id) ?? null;
  }, [detailTarget, payRuleById]);

  const detailLeaveDisplay = useMemo(
    () => (detailTarget ? resolveLeaveTimesheetDisplay(detailTarget) : null),
    [detailTarget]
  );

  const filteredRows = useMemo(() => {
    let list = rows;

    if (currentWeekOnly) {
      list = list.filter((row) =>
        isDateInPayWeek(row.work_date, selectedWeek.startIso, selectedWeek.endIso)
      );
    } else if (selectedWeek) {
      list = list.filter((row) =>
        isDateInPayWeek(row.work_date, selectedWeek.startIso, selectedWeek.endIso)
      );
    }

    if (selectedProjects.length > 0) {
      list = list.filter((row) =>
        selectedProjects.includes(row.project_name ?? "")
      );
    }

    return list;
  }, [rows, currentWeekOnly, selectedWeek, selectedProjects]);

  const selectableFilteredRows = useMemo(
    () => filteredRows.filter(isTimesheetSelectable),
    [filteredRows]
  );

  const selectableFilteredIds = useMemo(
    () => selectableFilteredRows.map((row) => row.id),
    [selectableFilteredRows]
  );

  const selectedVisibleCount = useMemo(
    () => selectedTimesheetIds.filter((id) => selectableFilteredIds.includes(id)).length,
    [selectedTimesheetIds, selectableFilteredIds]
  );

  const allSelectableSelected =
    selectableFilteredIds.length > 0 &&
    selectableFilteredIds.every((id) => selectedTimesheetIds.includes(id));

  const someSelectableSelected =
    selectableFilteredIds.some((id) => selectedTimesheetIds.includes(id)) &&
    !allSelectableSelected;

  useEffect(() => {
    if (masterCheckboxRef.current) {
      masterCheckboxRef.current.indeterminate = someSelectableSelected;
    }
  }, [someSelectableSelected]);

  useEffect(() => {
    setSelectedTimesheetIds((current) =>
      current.filter((id) => selectableFilteredIds.includes(id))
    );
  }, [selectableFilteredIds]);

  const toggleProject = (projectName: string) => {
    setSelectedProjects((current) =>
      current.includes(projectName)
        ? current.filter((name) => name !== projectName)
        : [...current, projectName]
    );
  };

  const toggleTimesheetSelection = (timesheetId: string) => {
    setSelectedTimesheetIds((current) =>
      current.includes(timesheetId)
        ? current.filter((id) => id !== timesheetId)
        : [...current, timesheetId]
    );
  };

  const toggleAllVisibleSelectable = () => {
    if (allSelectableSelected) {
      setSelectedTimesheetIds((current) =>
        current.filter((id) => !selectableFilteredIds.includes(id))
      );
      return;
    }

    setSelectedTimesheetIds((current) => [
      ...new Set([...current, ...selectableFilteredIds]),
    ]);
  };

  const clearSelection = () => {
    setSelectedTimesheetIds([]);
  };

  const handleBulkApprove = async () => {
    const idsToApprove = selectedTimesheetIds.filter((id) =>
      selectableFilteredIds.includes(id)
    );

    if (idsToApprove.length === 0) {
      showError("No pending timesheets selected for approval.");
      setBulkConfirmOpen(false);
      return;
    }

    setBulkApproving(true);

    const approvedBy = adminConsole?.adminWorkerId ?? null;
    const result = await approveAccountsTimesheets(idsToApprove, approvedBy);

    setBulkApproving(false);
    setBulkConfirmOpen(false);

    if (result.error) {
      showError(result.error);
      return;
    }

    const approvedCount = result.updated || idsToApprove.length;
    showSuccess(`Successfully approved ${approvedCount} timesheet${approvedCount === 1 ? "" : "s"}.`);
    setSelectedTimesheetIds([]);
    await loadRows();
  };

  const handleExport = () => {
    downloadPayrollTimesheetCsv(filteredRows);
    setMessage(`Exported ${filteredRows.length} timesheet row(s).`);
  };

  return (
    <div className="space-y-4">
      <AccountsNav />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Accounts <span className="text-orange-500">Timesheets</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Review worker timesheets by Wed–Tue pay week and export payroll data.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={filteredRows.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export Timesheets (CSV / Payroll)
        </button>
      </div>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {selectedVisibleCount > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-200">
            {selectedVisibleCount} Timesheet{selectedVisibleCount === 1 ? "" : "s"} Selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkConfirmOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              Approve Selected
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Deselect All
            </button>
          </div>
        </div>
      ) : null}

      <div className={cn(cardClass, "grid gap-4 p-4 lg:grid-cols-4")}>
        <div>
          <label htmlFor="pay-week-select" className={labelClass}>
            Pay Week
          </label>
          <select
            id="pay-week-select"
            value={selectedWeekStart}
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

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => setCurrentWeekOnly((value) => !value)}
            className={cn(
              "w-full rounded-lg px-4 py-2 text-sm font-semibold transition",
              currentWeekOnly
                ? "bg-blue-600 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            Current Week Only
          </button>
        </div>

        <div className="lg:col-span-2">
          <p className={labelClass}>Projects</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedProjects([])}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                selectedProjects.length === 0
                  ? "bg-orange-100 text-orange-800 ring-orange-200"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              )}
            >
              All Projects
            </button>
            {projectOptions.map((project) => (
              <button
                key={project}
                type="button"
                onClick={() => toggleProject(project)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                  selectedProjects.includes(project)
                    ? "bg-orange-100 text-orange-800 ring-orange-200"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {project}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cn(cardClass, "overflow-hidden")}>
        {loading ? (
          <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading timesheets…
          </div>
        ) : filteredRows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            No timesheets match the selected filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      ref={masterCheckboxRef}
                      type="checkbox"
                      checked={allSelectableSelected}
                      onChange={toggleAllVisibleSelectable}
                      disabled={selectableFilteredIds.length === 0}
                      aria-label="Select all visible timesheets"
                      className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                    />
                  </th>
                  <th className="px-3 py-3">Worker Name</th>
                  <th className="px-3 py-3">Trade</th>
                  <th className="px-3 py-3">Project</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Work Hours</th>
                  <th className="px-3 py-3">Break Hours</th>
                  <th className="px-3 py-3">Total Hours</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Signature</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const statusMeta = approvalStatusMeta(row.status);
                  const selectable = isTimesheetSelectable(row);
                  const isSelected = selectedTimesheetIds.includes(row.id);
                  const leaveDisplay = resolveLeaveTimesheetDisplay(row);

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "hover:bg-slate-50/80",
                        isSelected && "bg-emerald-50/50"
                      )}
                    >
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!selectable}
                          onChange={() => toggleTimesheetSelection(row.id)}
                          aria-label={`Select timesheet for ${row.worker_name}`}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.worker_name}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {row.worker_trade ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {row.project_name ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatTimesheetDatePeriod(row.work_date)}</span>
                          {leaveDisplay ? (
                            <TimesheetLeaveEntryBadge
                              label={leaveDisplay.label}
                              badgeClass={leaveDisplay.badgeClass}
                            />
                          ) : null}
                          {isAdvanceTimesheetDate(row.work_date) ? (
                            <TimesheetAdvanceEntryBadge />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {leaveDisplay ? (
                          <span className="font-medium text-slate-800">
                            {formatTimesheetHours(
                              Number(row.work_hours ?? row.total_hours)
                            )}
                          </span>
                        ) : (
                          formatTimesheetHours(Number(row.work_hours ?? row.total_hours))
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatTimesheetHours(
                          Number(row.break_hours ?? row.break_minutes / 60)
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {formatTimesheetHours(
                          Number(row.daily_total_hours ?? row.total_hours)
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            statusMeta.badgeClass
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {row.signature_url ? (
                          <img
                            src={row.signature_url}
                            alt="Signature"
                            className="h-8 w-16 rounded border border-slate-200 bg-white object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {bulkConfirmOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !bulkApproving && setBulkConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Approve timesheets</h3>
            <p className="mt-2 text-sm text-slate-600">
              Approve {selectedVisibleCount} timesheet{selectedVisibleCount === 1 ? "" : "s"}?
              Approved rows will be marked with an Approved status badge.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkConfirmOpen(false)}
                disabled={bulkApproving}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleBulkApprove()}
                disabled={bulkApproving}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {bulkApproving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve {selectedVisibleCount}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailTarget ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-900">Timesheet Details</h3>
            <p className="text-sm text-slate-500">
              {detailTarget.worker_name} · {formatTimesheetDatePeriod(detailTarget.work_date)}
              {detailLeaveDisplay ? (
                <>
                  {" "}
                  <TimesheetLeaveEntryBadge
                    className="align-middle"
                    label={detailLeaveDisplay.label}
                    badgeClass={detailLeaveDisplay.badgeClass}
                  />
                </>
              ) : null}
              {isAdvanceTimesheetDate(detailTarget.work_date) ? (
                <>
                  {" "}
                  <TimesheetAdvanceEntryBadge className="align-middle" />
                </>
              ) : null}
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-700">
              <p>
                <strong>Trade:</strong> {detailTarget.worker_trade ?? "—"}
              </p>
              <p>
                <strong>Project:</strong> {detailTarget.project_name ?? "—"}
              </p>
              <p>
                <strong>Work / Break / Total:</strong>{" "}
                {formatTimesheetHours(Number(detailTarget.work_hours ?? 0))} /{" "}
                {formatTimesheetHours(Number(detailTarget.break_hours ?? 0))} /{" "}
                {formatTimesheetHours(
                  Number(detailTarget.daily_total_hours ?? detailTarget.total_hours)
                )}
              </p>
              <p>
                <strong>Status:</strong>{" "}
                {timesheetStatusMeta(detailTarget.status).label}
              </p>
              {detailTarget.notes ? (
                <p>
                  <strong>Notes:</strong> {detailTarget.notes}
                </p>
              ) : null}
              {detailTarget.signature_url ? (
                <img
                  src={detailTarget.signature_url}
                  alt="Worker signature"
                  className="mt-2 h-20 rounded border border-slate-200 bg-white object-contain p-2"
                />
              ) : null}
            </div>

            <TimesheetPayBreakdownPanel
              timesheet={detailTarget}
              payRule={detailPayRule}
            />

            <button
              type="button"
              onClick={() => setDetailTarget(null)}
              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
