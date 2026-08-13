"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
import {
  REPORT_MODULE_OPTIONS,
  saveGeneratedReport,
  type ReportExportFormat,
  type ReportModuleId,
} from "@/lib/generated-reports-service";
import { generateReportPdfFromCsv, downloadReportBlob } from "@/lib/pdf/report-pdf";
import { generateReportExport } from "@/lib/report-export-engine";
import type { DbProject } from "@/lib/project-resolver";
import { ACCOUNTS_TIMESHEET_STATE_OPTIONS } from "@/lib/accounts-timesheets";
import type { WorkerStateRegion } from "@/lib/worker-state-region";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ExportNewReportModalProps {
  projects: DbProject[];
  actionedById: string | null;
  actionedByName: string;
  onClose: () => void;
  onGenerated: () => void;
  onError: (message: string) => void;
}

const EXPORT_FORMAT_OPTIONS: {
  id: ReportExportFormat;
  label: string;
  description: string;
  icon: typeof FileText;
}[] = [
  {
    id: "pdf",
    label: "PDF Document",
    description:
      "Formatted PDF summary with site headers, module tables, and export metadata.",
    icon: FileText,
  },
  {
    id: "excel",
    label: "Excel Spreadsheet (.csv)",
    description: "Full raw data export for spreadsheets and further analysis.",
    icon: FileSpreadsheet,
  },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthAgoIso(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
}

export default function ExportNewReportModal({
  projects,
  actionedById,
  actionedByName,
  onClose,
  onGenerated,
  onError,
}: ExportNewReportModalProps) {
  const [allProjects, setAllProjects] = useState(true);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(monthAgoIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [selectedModules, setSelectedModules] = useState<ReportModuleId[]>([]);
  const [selectedStates, setSelectedStates] = useState<WorkerStateRegion[]>([]);
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>("excel");
  const [generating, setGenerating] = useState(false);

  const effectiveProjectIds = useMemo(() => {
    if (allProjects) return [];
    return selectedProjectIds;
  }, [allProjects, selectedProjectIds]);

  const projectNames = useMemo(() => {
    if (allProjects) return [] as string[];
    return projects
      .filter((project) => selectedProjectIds.includes(project.id))
      .map((project) => project.project_name)
      .filter((name): name is string => Boolean(name));
  }, [allProjects, projects, selectedProjectIds]);

  const includesTimesheetHours = selectedModules.includes("timesheets_hours");

  const toggleState = (state: WorkerStateRegion) => {
    setSelectedStates((current) =>
      current.includes(state)
        ? current.filter((value) => value !== state)
        : [...current, state]
    );
  };

  const toggleModule = (moduleId: ReportModuleId) => {
    setSelectedModules((current) =>
      current.includes(moduleId)
        ? current.filter((value) => value !== moduleId)
        : [...current, moduleId]
    );
  };

  const handleGenerate = async () => {
    if (!startDate || !endDate) {
      onError("Start date and end date are required.");
      return;
    }
    if (toDay(startDate) > toDay(endDate)) {
      onError("Start date must be on or before end date.");
      return;
    }
    if (selectedModules.length === 0) {
      onError("Select at least one module to include.");
      return;
    }
    if (!allProjects && selectedProjectIds.length === 0) {
      onError("Select at least one project or choose All Projects.");
      return;
    }

    setGenerating(true);
    try {
      const exportResult = await generateReportExport({
        startDate,
        endDate,
        projectIds: effectiveProjectIds,
        modules: selectedModules,
        projects,
        stateFilters: includesTimesheetHours ? selectedStates : undefined,
      });

      const resolvedProjectNames = allProjects
        ? ["All Projects"]
        : projectNames.length > 0
          ? projectNames
          : ["All Projects"];

      let fileName = exportResult.fileName;

      if (exportFormat === "pdf") {
        const pdfResult = await generateReportPdfFromCsv({
          csvContent: exportResult.csvContent,
          startDate,
          endDate,
          projectNames: resolvedProjectNames,
          modules: selectedModules,
          actionedByName,
        });
        downloadReportBlob(pdfResult.fileName, pdfResult.blob);
        fileName = pdfResult.fileName;
      } else {
        const blob = new Blob([exportResult.csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        downloadReportBlob(exportResult.fileName, blob);
      }

      const { error } = await saveGeneratedReport({
        actioned_by_id: actionedById,
        actioned_by_name: actionedByName,
        start_date: startDate,
        end_date: endDate,
        selected_modules: selectedModules,
        project_ids: effectiveProjectIds,
        project_names: resolvedProjectNames,
        file_name: fileName,
        csv_content: exportResult.csvContent,
        export_format: exportFormat,
      });

      if (error) onError(error);
      onGenerated();
      onClose();
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Failed to generate report export."
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-w-3xl")}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Export New Report</h2>
            <p className="mt-1 text-sm text-slate-500">
              Configure project filters, date range, modules, and export format.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">1. Project Filter</h3>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={allProjects}
                onChange={(event) => {
                  setAllProjects(event.target.checked);
                  if (event.target.checked) setSelectedProjectIds([]);
                }}
                className="rounded border-slate-300 text-orange-500"
              />
              All Projects
            </label>
            {!allProjects ? (
              <ProjectMultiSelect
                projects={projects}
                selectedProjectIds={selectedProjectIds}
                onChange={setSelectedProjectIds}
              />
            ) : null}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">2. Date Range</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="report-start-date" className={labelClass}>
                  Start Date
                </label>
                <input
                  id="report-start-date"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="report-end-date" className={labelClass}>
                  End Date
                </label>
                <input
                  id="report-end-date"
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">3. Modules</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {REPORT_MODULE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-orange-200"
                >
                  <input
                    type="checkbox"
                    checked={selectedModules.includes(option.id)}
                    onChange={() => toggleModule(option.id)}
                    className="mt-0.5 rounded border-slate-300 text-orange-500"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </section>

          {includesTimesheetHours ? (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                4. State Filter (Timesheets & Daily Hours)
              </h3>
              <p className="text-xs text-slate-500">
                Optional. Filter attendance and hours by worker state or project location.
                No pay rates are included in this module.
              </p>
              <div className="flex flex-wrap gap-2">
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
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              {includesTimesheetHours ? "5. Export Format" : "4. Export Format"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {EXPORT_FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = exportFormat === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setExportFormat(option.id)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left transition",
                      active
                        ? "border-orange-500 bg-orange-50 shadow-sm ring-1 ring-orange-200"
                        : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
                    )}
                    aria-pressed={active}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          active ? "text-orange-600" : "text-slate-400"
                        )}
                      />
                      {option.label}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={generating}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : exportFormat === "pdf" ? (
              <>
                <FileText className="h-4 w-4" />
                Generate PDF Report
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Generate Spreadsheet Export
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function toDay(value: string): number {
  const date = new Date(value.slice(0, 10));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
