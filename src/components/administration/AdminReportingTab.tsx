"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus, RefreshCw } from "lucide-react";
import ExportNewReportModal from "@/components/administration/ExportNewReportModal";
import FormTester, { FormTesterLaunchButton } from "@/components/administration/FormTester";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import type { DbProject } from "@/lib/project-resolver";
import {
  downloadGeneratedReportCsv,
  fetchGeneratedReports,
  formatReportDate,
  formatReportModules,
  formatReportProjects,
  type GeneratedReportRecord,
} from "@/lib/generated-reports-service";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AdminReportingTabProps {
  projects: DbProject[];
  actionedById: string | null;
  actionedByName: string;
}

export default function AdminReportingTab({
  projects,
  actionedById,
  actionedByName,
}: AdminReportingTabProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<GeneratedReportRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFormTester, setShowFormTester] = useState(false);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const { reports: rows, error } = await fetchGeneratedReports();
    setReports(rows);
    if (error) showError(error);
    setLoading(false);
  }, [showError]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filteredReports = reports.filter((report) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const haystack = [
      report.actioned_by_name,
      formatReportModules(report.selected_modules),
      formatReportProjects(report.project_names),
      report.file_name,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reporting</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review previously generated exports or configure a new multi-module report.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-[220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search reports…"
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={() => void loadReports()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
          >
            <Plus className="h-4 w-4" />
            Export New Report
          </button>
          <FormTesterLaunchButton onClick={() => setShowFormTester(true)} />
        </div>
      </div>

      <div className={cn(cardClass, "overflow-hidden")}>
        {loading ? (
          <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading previous reports…
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            No generated reports yet. Use Export New Report to create your first export.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Date of Report</th>
                  <th className="px-4 py-3 font-semibold">Actioned By</th>
                  <th className="px-4 py-3 font-semibold">Included Modules</th>
                  <th className="px-4 py-3 font-semibold">Projects Filter</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <tr key={report.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-700">
                      {formatReportDate(report.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {report.actioned_by_name}
                    </td>
                    <td className="max-w-md px-4 py-3 text-slate-700">
                      {formatReportModules(report.selected_modules)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-700">
                      {formatReportProjects(report.project_names)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => downloadGeneratedReportCsv(report)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showFormTester ? <FormTester onClose={() => setShowFormTester(false)} /> : null}

      {showExportModal ? (
        <ExportNewReportModal
          projects={projects}
          actionedById={actionedById}
          actionedByName={actionedByName}
          onClose={() => setShowExportModal(false)}
          onGenerated={() => {
            showSuccess("Report generated and saved to the log.");
            void loadReports();
          }}
          onError={showError}
        />
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
