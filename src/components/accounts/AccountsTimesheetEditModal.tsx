"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  isLeavePreviewTimesheetRow,
  resolveTimesheetPayRule,
  formatTimesheetDatePeriod,
  type AccountsTimesheetRow,
} from "@/lib/accounts-timesheets";
import {
  mergeAccountsTimesheetRow,
  resolveAccountsTimesheetBreaks,
  updateAccountsTimesheet,
} from "@/lib/accounts-timesheet-update";
import type { PayRateRule } from "@/lib/pay-rates-and-rules";
import {
  fetchTimesheetFormOptions,
  formatTimesheetProjectDisplayName,
  formatTimesheetProjectOptionLabel,
  groupTimesheetProjectsByClient,
  type TimesheetProject,
} from "@/lib/timesheet-options";
import {
  calculateSlotMinutes,
  calculateTimesheetHours,
  isAdvanceTimesheetDate,
  resolveTimesheetDisplayTotals,
} from "@/lib/timesheet-utils";
import {
  isActTimesheetJurisdiction,
  validateActBreakRequirement,
} from "@/lib/timesheet-act-break-validation";
import { resolvePayRuleTemplateNameForWorker } from "@/lib/worker-pay-rule-assignment";
import TimesheetAdvanceEntryBadge from "@/components/workers/TimesheetAdvanceEntryBadge";
import TimesheetLeaveEntryBadge from "@/components/workers/TimesheetLeaveEntryBadge";
import TimesheetPayBreakdownPanel from "@/components/accounts/TimesheetPayBreakdownPanel";
import { resolveLeaveTimesheetDisplay } from "@/lib/leave-timesheet-rules";
import { modalClass, modalOverlayClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AccountsTimesheetEditModalProps {
  timesheet: AccountsTimesheetRow;
  payRules: PayRateRule[];
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (row: AccountsTimesheetRow) => void;
  onError: (message: string) => void;
}

export default function AccountsTimesheetEditModal({
  timesheet,
  payRules,
  readOnly = false,
  onClose,
  onSaved,
  onError,
}: AccountsTimesheetEditModalProps) {
  const canEdit = !readOnly && !isLeavePreviewTimesheetRow(timesheet);
  const totals = resolveTimesheetDisplayTotals(timesheet);
  const leaveDisplay = resolveLeaveTimesheetDisplay(timesheet);
  const assignedPayRuleName =
    resolveTimesheetPayRule(timesheet, payRules)?.rule_name ??
    resolvePayRuleTemplateNameForWorker(timesheet.worker_state);
  const isActWorker = isActTimesheetJurisdiction({
    workerState: timesheet.worker_state,
    payRuleName: assignedPayRuleName,
  });

  const [startTime, setStartTime] = useState(totals.startTime?.slice(0, 5) || "06:30");
  const [finishTime, setFinishTime] = useState(totals.endTime?.slice(0, 5) || "14:30");
  const [breakMinutes, setBreakMinutes] = useState(
    Math.round((totals.breakHours || 0) * 60)
  );
  const [breakStartTime, setBreakStartTime] = useState(
    timesheet.breaks?.[0]?.startTime?.slice(0, 5) ?? ""
  );
  const [breakEndTime, setBreakEndTime] = useState(
    timesheet.breaks?.[0]?.endTime?.slice(0, 5) ?? ""
  );
  const [totalHours, setTotalHours] = useState(totals.dailyTotalHours || 0);
  const [totalHoursDirty, setTotalHoursDirty] = useState(false);
  const [notes, setNotes] = useState(timesheet.notes ?? "");
  const [plantOperated, setPlantOperated] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(timesheet.project_id ?? "");
  const [projects, setProjects] = useState<TimesheetProject[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchTimesheetFormOptions().then((result) => {
      setProjects(result.projects);
    });
  }, []);

  const projectGroups = useMemo(
    () => groupTimesheetProjectsByClient(projects),
    [projects]
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const resolvedBreakMinutes = useMemo(() => {
    if (breakStartTime && breakEndTime) {
      const slot = calculateSlotMinutes(breakStartTime, breakEndTime);
      if (slot > 0) return slot;
    }
    return Math.max(0, breakMinutes);
  }, [breakStartTime, breakEndTime, breakMinutes]);

  const calculatedHours = useMemo(
    () => calculateTimesheetHours(startTime, finishTime, resolvedBreakMinutes),
    [startTime, finishTime, resolvedBreakMinutes]
  );

  useEffect(() => {
    if (!totalHoursDirty) {
      setTotalHours(calculatedHours);
    }
  }, [calculatedHours, totalHoursDirty]);

  const draftTimesheet = useMemo<AccountsTimesheetRow>(
    () => ({
      ...timesheet,
      start_time: startTime,
      finish_time: finishTime,
      break_minutes: resolvedBreakMinutes,
      break_hours: Math.round((resolvedBreakMinutes / 60) * 100) / 100,
      total_hours: totalHours,
      daily_total_hours: totalHours,
      work_hours: calculatedHours,
      project_id: selectedProjectId || timesheet.project_id,
      project_name: selectedProject
        ? formatTimesheetProjectDisplayName(selectedProject)
        : timesheet.project_name,
      notes: notes.trim() || null,
      activities: (timesheet.activities ?? []).map((row, index, all) => ({
        ...row,
        startTime: index === 0 ? startTime : row.startTime,
        endTime: index === all.length - 1 ? finishTime : row.endTime,
      })),
      breaks: resolveAccountsTimesheetBreaks({
        breakStartTime,
        breakEndTime,
        breakMinutes: resolvedBreakMinutes,
      }),
    }),
    [
      timesheet,
      startTime,
      finishTime,
      resolvedBreakMinutes,
      totalHours,
      calculatedHours,
      selectedProjectId,
      selectedProject,
      notes,
      breakStartTime,
      breakEndTime,
    ]
  );

  const payRule = useMemo(
    () => resolveTimesheetPayRule(draftTimesheet, payRules),
    [draftTimesheet, payRules]
  );

  const handleSave = async () => {
    if (!canEdit) return;

    const actBreakError = validateActBreakRequirement({
      workerState: timesheet.worker_state,
      payRuleName: assignedPayRuleName,
      submit: true,
      breaks:
        breakStartTime && breakEndTime
          ? [{ id: "break-edit", startTime: breakStartTime, endTime: breakEndTime }]
          : [],
      breakMinutes: resolvedBreakMinutes,
      notes,
      activities: draftTimesheet.activities,
    });
    if (actBreakError) {
      onError(actBreakError);
      return;
    }

    if (totalHours <= 0) {
      onError("Daily total must be greater than 0 hours.");
      return;
    }

    setSaving(true);
    const result = await updateAccountsTimesheet(
      {
        id: timesheet.id,
        workerId: timesheet.worker_id,
        workDate: timesheet.work_date,
        projectId: selectedProjectId || timesheet.project_id,
        timesheetProject: selectedProject,
        projectName: selectedProject
          ? formatTimesheetProjectDisplayName(selectedProject)
          : timesheet.project_name,
        startTime,
        finishTime,
        breakMinutes: resolvedBreakMinutes,
        breakStartTime,
        breakEndTime,
        totalHours,
        notes,
        plantOperated,
        workerState: timesheet.worker_state,
        workerTrade: timesheet.worker_trade,
        activities: timesheet.activities,
      },
      {
        payRule,
        hsrApplicable: timesheet.worker_is_hsr ?? false,
        isApprentice: timesheet.worker_is_apprentice ?? false,
        hasCompanyVehicle: timesheet.worker_has_company_vehicle ?? false,
      }
    );
    setSaving(false);

    if (result.error || !result.data) {
      onError(result.error ?? "Failed to update timesheet.");
      return;
    }

    onSaved(mergeAccountsTimesheetRow(timesheet, result.data));
  };

  const fieldDisabled = !canEdit || saving;

  return (
    <div className={cn(modalOverlayClass, "z-[70]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {canEdit ? "View/Edit Timesheet" : "Timesheet Details"}
            </h3>
            <p className="text-sm text-slate-500">
              {timesheet.worker_name} · {formatTimesheetDatePeriod(timesheet.work_date)}
              {leaveDisplay ? (
                <>
                  {" "}
                  <TimesheetLeaveEntryBadge
                    className="align-middle"
                    label={leaveDisplay.label}
                    badgeClass={leaveDisplay.badgeClass}
                  />
                </>
              ) : null}
              {isAdvanceTimesheetDate(timesheet.work_date) ? (
                <>
                  {" "}
                  <TimesheetAdvanceEntryBadge className="align-middle" />
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLeavePreviewTimesheetRow(timesheet) ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This is a leave preview row and cannot be edited.
          </p>
        ) : null}

        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            <strong>Trade:</strong> {timesheet.worker_trade ?? "—"}
          </p>

          <label className="block space-y-1">
            <span className={labelClass}>Project assignment</span>
            <select
              className={inputClass}
              value={selectedProjectId}
              disabled={fieldDisabled}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              <option value="">{timesheet.project_name || "Select a project"}</option>
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
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Start time</span>
              <input
                type="time"
                className={inputClass}
                value={startTime}
                disabled={fieldDisabled}
                onChange={(event) => {
                  setStartTime(event.target.value.slice(0, 5));
                  setTotalHoursDirty(false);
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Finish time</span>
              <input
                type="time"
                className={inputClass}
                value={finishTime}
                disabled={fieldDisabled}
                onChange={(event) => {
                  setFinishTime(event.target.value.slice(0, 5));
                  setTotalHoursDirty(false);
                }}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>
                Break start{isActWorker ? " *" : ""}
              </span>
              <input
                type="time"
                className={inputClass}
                value={breakStartTime}
                required={isActWorker && canEdit}
                disabled={fieldDisabled}
                onChange={(event) => {
                  setBreakStartTime(event.target.value.slice(0, 5));
                  setTotalHoursDirty(false);
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>
                Break finish{isActWorker ? " *" : ""}
              </span>
              <input
                type="time"
                className={inputClass}
                value={breakEndTime}
                required={isActWorker && canEdit}
                disabled={fieldDisabled}
                onChange={(event) => {
                  setBreakEndTime(event.target.value.slice(0, 5));
                  setTotalHoursDirty(false);
                }}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className={labelClass}>
              Break duration (minutes){isActWorker ? " *" : ""}
            </span>
            <input
              type="number"
              min={isActWorker ? 1 : 0}
              step={1}
              required={isActWorker && canEdit}
              className={inputClass}
              value={resolvedBreakMinutes}
              disabled={fieldDisabled}
              onChange={(event) => {
                setBreakMinutes(Math.max(0, Number(event.target.value) || 0));
                setBreakStartTime("");
                setBreakEndTime("");
                setTotalHoursDirty(false);
              }}
            />
            {isActWorker ? (
              <p className="text-xs font-semibold text-amber-800">
                A break must be recorded for ACT timesheets.
              </p>
            ) : (
              <p className="text-xs text-slate-500">Optional for NSW, WA, and NZ.</p>
            )}
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Total hours</span>
            <input
              type="number"
              min={0}
              step={0.01}
              className={inputClass}
              value={totalHours}
              disabled={fieldDisabled}
              onChange={(event) => {
                setTotalHours(Math.max(0, Number(event.target.value) || 0));
                setTotalHoursDirty(true);
              }}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Worker notes / allowances</span>
            <textarea
              className={cn(inputClass, "min-h-[80px] resize-y")}
              value={notes}
              disabled={fieldDisabled}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes, allowances, or other payroll comments…"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Plant operated</span>
            <input
              className={inputClass}
              value={plantOperated}
              disabled={fieldDisabled}
              onChange={(event) => setPlantOperated(event.target.value)}
              placeholder="Optional plant or equipment used"
            />
          </label>

          {!readOnly ? (
            <TimesheetPayBreakdownPanel timesheet={draftTimesheet} payRule={payRule} />
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Changes
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
