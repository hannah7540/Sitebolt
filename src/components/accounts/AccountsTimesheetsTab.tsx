"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
  X,
} from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import Toast from "@/components/ui/Toast";
import { useAdminConsoleOptional } from "@/contexts/AdminConsoleContext";
import { useFormToast } from "@/hooks/useFormToast";
import {
  approvalStatusMeta,
  approveAccountsTimesheets,
  buildPayrollExportFilename,
  downloadPayrollTimesheetCsv,
  ACCOUNTS_TIMESHEET_STATE_OPTIONS,
  fetchAccountsTimesheets,
  formatTimesheetDatePeriod,
  formatTimesheetLineBreakdownAmount,
  isLeavePreviewTimesheetRow,
  mergeAdvanceLeaveRequestsIntoTimesheets,
  resolveTimesheetLineBreakdown,
  resolveTimesheetPayRule,
  resolveTimesheetStateForFilter,
  type AccountsTimesheetLineBreakdown,
  type AccountsTimesheetRow,
  type AccountsTimesheetStateFilter,
} from "@/lib/accounts-timesheets";
import {
  formatTimesheetHours,
  normalizeTimesheetStatus,
  resolveTimesheetDisplayTotals,
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
  resolvePayWeekOption,
  shiftPayWeekStart,
} from "@/lib/pay-week-utils";
import { fetchLeaveRequestsNormalized, isLeaveRequestPending } from "@/lib/leave-requests";
import type { LeaveRequest } from "@/lib/supabase";
import { type AccountsAccessRole } from "@/lib/security-roles";
import { fetchProjects, getCachedProjects } from "@/lib/project-resolver";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AccountsTimesheetsTabProps {
  accountsAccessRole: AccountsAccessRole;
  readOnly?: boolean;
}

type TimesheetSortColumn =
  | "worker"
  | "date"
  | "lineItems"
  | "workTotal"
  | "breakTotal"
  | "dailyTotal"
  | "status";

type TimesheetSortDirection = "asc" | "desc";

interface TimesheetTableRow extends AccountsTimesheetRow {
  displayTotals: ReturnType<typeof resolveTimesheetDisplayTotals>;
  lineBreakdown: AccountsTimesheetLineBreakdown;
}

interface SortableTimesheetHeaderProps {
  label: string;
  column: TimesheetSortColumn;
  sortColumn: TimesheetSortColumn | null;
  sortDirection: TimesheetSortDirection | null;
  onSort: (column: TimesheetSortColumn) => void;
  className?: string;
}

function SortableTimesheetHeader({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className,
}: SortableTimesheetHeaderProps) {
  const isActive = sortColumn === column;
  const Icon = isActive
    ? sortDirection === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th className={cn("px-3 py-3", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1.5 text-left font-semibold uppercase tracking-wide transition hover:text-slate-800",
          isActive ? "text-slate-900" : "text-slate-500"
        )}
        aria-sort={
          isActive
            ? sortDirection === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
    </th>
  );
}

function compareTimesheetRows(
  left: TimesheetTableRow,
  right: TimesheetTableRow,
  column: TimesheetSortColumn,
  direction: TimesheetSortDirection
): number {
  let result = 0;

  switch (column) {
    case "worker":
      result = left.worker_name.localeCompare(right.worker_name, undefined, {
        sensitivity: "base",
      });
      break;
    case "date":
      result = left.work_date.localeCompare(right.work_date);
      break;
    case "lineItems":
      result = left.lineBreakdown.summary.localeCompare(
        right.lineBreakdown.summary,
        undefined,
        { sensitivity: "base" }
      );
      break;
    case "workTotal":
      result = left.displayTotals.workHours - right.displayTotals.workHours;
      break;
    case "breakTotal":
      result = left.displayTotals.breakHours - right.displayTotals.breakHours;
      break;
    case "dailyTotal":
      result =
        left.displayTotals.dailyTotalHours - right.displayTotals.dailyTotalHours;
      break;
    case "status":
      result = normalizeTimesheetStatus(left.status).localeCompare(
        normalizeTimesheetStatus(right.status)
      );
      break;
  }

  return direction === "asc" ? result : -result;
}

function isTimesheetSelectable(row: AccountsTimesheetRow): boolean {
  if (isLeavePreviewTimesheetRow(row)) return false;
  return !isTimesheetApproved(row.status);
}

function resolveTimesheetStatusDisplay(row: AccountsTimesheetRow): {
  label: string;
  badgeClass: string;
} {
  if (isLeavePreviewTimesheetRow(row) && isLeaveRequestPending(row.leave_preview_request_status)) {
    return {
      label: "Leave Requested",
      badgeClass: "bg-violet-100 text-violet-800",
    };
  }

  return approvalStatusMeta(row.status);
}

const PAY_WEEK_PAST_COUNT = 52;
const PAY_WEEK_FUTURE_COUNT = 52;

export default function AccountsTimesheetsTab({
  accountsAccessRole,
  readOnly: readOnlyProp,
}: AccountsTimesheetsTabProps) {
  const adminConsole = useAdminConsoleOptional();
  const readOnly = readOnlyProp ?? adminConsole?.accountsReadOnly ?? false;
  const payWeekOptions = useMemo(
    () =>
      listPayWeekOptions({
        pastCount: PAY_WEEK_PAST_COUNT,
        futureCount: PAY_WEEK_FUTURE_COUNT,
      }),
    []
  );
  const currentPayWeek = useMemo(() => getPayWeekRange(new Date()), []);

  const [rows, setRows] = useState<AccountsTimesheetRow[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payRules, setPayRules] = useState<PayRateRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWeekStart, setSelectedWeekStart] = useState(currentPayWeek.startIso);
  const [selectedStates, setSelectedStates] = useState<AccountsTimesheetStateFilter[]>([]);
  const [projects, setProjects] = useState(() => getCachedProjects());
  const [detailTarget, setDetailTarget] = useState<AccountsTimesheetRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedTimesheetIds, setSelectedTimesheetIds] = useState<string[]>([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [sortColumn, setSortColumn] = useState<TimesheetSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<TimesheetSortDirection | null>(
    null
  );
  const masterCheckboxRef = useRef<HTMLInputElement>(null);

  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const loadRows = useCallback(async () => {
    setLoading(true);
    const [data, rulesResult, projectList, leaveData] = await Promise.all([
      fetchAccountsTimesheets(),
      fetchPayRatesAndRules(),
      fetchProjects(),
      fetchLeaveRequestsNormalized(),
    ]);
    setRows(data);
    setLeaveRequests(leaveData);
    setPayRules(rulesResult.rules);
    setProjects(projectList.length > 0 ? projectList : getCachedProjects());
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const selectedWeek = useMemo(
    () =>
      payWeekOptions.find((option) => option.startIso === selectedWeekStart) ??
      resolvePayWeekOption(selectedWeekStart),
    [payWeekOptions, selectedWeekStart]
  );

  const viewingCurrentPayWeek = isCurrentPayWeek(
    selectedWeek.startIso,
    selectedWeek.endIso
  );

  const goToPreviousPayWeek = () => {
    setSelectedWeekStart((current) => shiftPayWeekStart(current, -1));
  };

  const goToNextPayWeek = () => {
    setSelectedWeekStart((current) => shiftPayWeekStart(current, 1));
  };

  const goToCurrentPayWeek = () => {
    setSelectedWeekStart(currentPayWeek.startIso);
  };

  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const detailPayRule = useMemo(() => {
    if (!detailTarget) return null;
    return resolveTimesheetPayRule(detailTarget, payRules);
  }, [detailTarget, payRules]);

  const detailLeaveDisplay = useMemo(
    () => (detailTarget ? resolveLeaveTimesheetDisplay(detailTarget) : null),
    [detailTarget]
  );

  const detailLineBreakdown = useMemo(
    () =>
      detailTarget
        ? resolveTimesheetLineBreakdown(detailTarget, payRules)
        : null,
    [detailTarget, payRules]
  );

  const filteredRows = useMemo(() => {
    let list = mergeAdvanceLeaveRequestsIntoTimesheets(
      rows,
      leaveRequests,
      selectedWeek.startIso,
      selectedWeek.endIso
    );

    list = list.filter((row) =>
      isDateInPayWeek(row.work_date, selectedWeek.startIso, selectedWeek.endIso)
    );

    if (selectedStates.length > 0) {
      list = list.filter((row) => {
        const state = resolveTimesheetStateForFilter(row, projectById);
        return state != null && selectedStates.includes(state);
      });
    }

    return list;
  }, [rows, leaveRequests, selectedWeek, selectedStates, projectById]);

  const tableRows = useMemo<TimesheetTableRow[]>(
    () =>
      filteredRows.map((row) => ({
        ...row,
        displayTotals: resolveTimesheetDisplayTotals(row),
        lineBreakdown: resolveTimesheetLineBreakdown(row, payRules),
      })),
    [filteredRows, payRules]
  );

  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return tableRows;
    }

    return [...tableRows].sort((left, right) =>
      compareTimesheetRows(left, right, sortColumn, sortDirection)
    );
  }, [tableRows, sortColumn, sortDirection]);

  const handleSort = (column: TimesheetSortColumn) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }

    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }

    setSortColumn(null);
    setSortDirection(null);
  };

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

  const toggleState = (state: AccountsTimesheetStateFilter) => {
    setSelectedStates((current) =>
      current.includes(state)
        ? current.filter((value) => value !== state)
        : [...current, state]
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

  const handleExport = async () => {
    downloadPayrollTimesheetCsv(sortedRows, payRules, {
      projects,
      filename: buildPayrollExportFilename(sortedRows),
    });
    setMessage(`Exported ${sortedRows.length} timesheet row(s).`);
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
            Review worker timesheets by Wed–Tue pay week
            {readOnly ? " (read-only)." : " and export payroll data."}
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={handleExport}
            disabled={sortedRows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        ) : null}
      </div>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {message}
        </p>
      ) : null}

      {!readOnly && selectedVisibleCount > 0 ? (
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goToCurrentPayWeek}
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="min-w-[260px] flex-1">
            <label htmlFor="pay-week-select" className={labelClass}>
              Jump to Week
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
                  {option.startIso > currentPayWeek.startIso ? " (Upcoming)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className={labelClass}>State</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedStates([])}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                selectedStates.length === 0
                  ? "bg-orange-100 text-orange-800 ring-orange-200"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              )}
            >
              All States
            </button>
            {ACCOUNTS_TIMESHEET_STATE_OPTIONS.map((state) => (
              <button
                key={state}
                type="button"
                onClick={() => toggleState(state)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset",
                  selectedStates.includes(state)
                    ? "bg-orange-100 text-orange-800 ring-orange-200"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {state}
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
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {!readOnly ? (
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
                  ) : null}
                  <SortableTimesheetHeader
                    label="Worker"
                    column="worker"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTimesheetHeader
                    label="Timesheet Date"
                    column="date"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTimesheetHeader
                    label="Daily Entries"
                    column="lineItems"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTimesheetHeader
                    label="Work Total"
                    column="workTotal"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTimesheetHeader
                    label="Break Total"
                    column="breakTotal"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTimesheetHeader
                    label="Daily Total"
                    column="dailyTotal"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableTimesheetHeader
                    label="Status"
                    column="status"
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                  />
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row) => {
                  const statusMeta = resolveTimesheetStatusDisplay(row);
                  const selectable = isTimesheetSelectable(row);
                  const isSelected = selectedTimesheetIds.includes(row.id);
                  const leaveDisplay = resolveLeaveTimesheetDisplay(row);
                  const { workHours, breakHours, dailyTotalHours } = row.displayTotals;
                  const { lineBreakdown } = row;

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "hover:bg-slate-50/80",
                        isSelected && "bg-emerald-50/50"
                      )}
                    >
                      {!readOnly ? (
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
                      ) : null}
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {row.worker_name}
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
                        <div className="space-y-1">
                          {lineBreakdown.items.length > 0 ? (
                            lineBreakdown.items.map((item) => (
                              <div key={`${row.id}-${item.category}-${item.label}`} className="text-xs">
                                <span className="font-medium text-slate-800">
                                  {formatTimesheetHours(item.hours)} {item.label}
                                </span>
                                {item.amount > 0 && !readOnly ? (
                                  <span className="text-slate-500">
                                    {" "}
                                    · {formatTimesheetLineBreakdownAmount(item.amount)}
                                  </span>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {leaveDisplay ? (
                          <span className="font-medium text-slate-800">
                            {formatTimesheetHours(workHours)}
                          </span>
                        ) : (
                          formatTimesheetHours(workHours)
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatTimesheetHours(breakHours)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {formatTimesheetHours(dailyTotalHours)}
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

      {!readOnly && bulkConfirmOpen ? (
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
              {detailLineBreakdown && detailLineBreakdown.items.length > 0 ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">
                    Daily Entry Breakdown
                  </h4>
                  <div className="mt-3 space-y-2">
                    {detailLineBreakdown.items.map((item) => (
                      <div
                        key={`${item.category}-${item.label}`}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <div>
                          <p className="font-medium text-slate-800">
                            {formatTimesheetHours(item.hours)} {item.label}
                          </p>
                          {item.rate > 0 ? (
                            <p className="text-xs text-slate-500">
                              {formatTimesheetLineBreakdownAmount(item.rate)}/hr
                            </p>
                          ) : null}
                        </div>
                        <p className="font-semibold tabular-nums text-slate-900">
                          {formatTimesheetLineBreakdownAmount(item.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {(() => {
                const totals = resolveTimesheetDisplayTotals(detailTarget);
                return (
                  <>
                    <p>
                      <strong>Work / Leave / Break / Daily Total:</strong>{" "}
                      {formatTimesheetHours(totals.workHours)} /{" "}
                      {formatTimesheetHours(totals.leaveHours)} /{" "}
                      {formatTimesheetHours(totals.breakHours)} /{" "}
                      {formatTimesheetHours(totals.dailyTotalHours)}
                    </p>
                  </>
                );
              })()}
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

            {!readOnly ? (
              <TimesheetPayBreakdownPanel
                timesheet={detailTarget}
                payRule={detailPayRule}
              />
            ) : null}

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
