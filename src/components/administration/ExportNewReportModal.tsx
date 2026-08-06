"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
import {
  REPORT_MODULE_OPTIONS,
  saveGeneratedReport,
  type ReportModuleId,
} from "@/lib/generated-reports-service";
import { generateReportExport } from "@/lib/report-export-engine";
import type { DbProject } from "@/lib/project-resolver";
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
      const result = await generateReportExport({
        startDate,
        endDate,
        projectIds: effectiveProjectIds,
        modules: selectedModules,
        projects,
      });

      const blob = new Blob([result.csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      link.click();
      URL.revokeObjectURL(url);

      const { error } = await saveGeneratedReport({
        actioned_by_id: actionedById,
        actioned_by_name: actionedByName,
        start_date: startDate,
        end_date: endDate,
        selected_modules: selectedModules,
        project_ids: effectiveProjectIds,
        project_names: allProjects
          ? ["All Projects"]
          : projectNames.length > 0
            ? projectNames
            : ["All Projects"],
        file_name: result.fileName,
        csv_content: result.csvContent,
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
              Configure project filters, date range, and modules for your export.
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
            ) : (
              "Generate & Export Report"
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
