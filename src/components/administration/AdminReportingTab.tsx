"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import ExportNewReportModal from "@/components/administration/ExportNewReportModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import type { DbProject } from "@/lib/project-resolver";
import {
  downloadGeneratedReportExcel,
  downloadGeneratedReportPdf,
  fetchGeneratedReports,
  formatReportDate,
  formatReportModules,
  formatReportProjects,
  type GeneratedReportRecord,
  type ReportExportFormat,
} from "@/lib/generated-reports-service";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AdminReportingTabProps {
  projects: DbProject[];
  actionedById: string | null;
  actionedByName: string;
}

function FormatBadge({ format }: { format: ReportExportFormat }) {
  const isPdf = format === "pdf";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        isPdf
          ? "bg-red-50 text-red-700 ring-1 ring-red-200"
          : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
      )}
    >
      {isPdf ? <FileText className="h-3 w-3" /> : <FileSpreadsheet className="h-3 w-3" />}
      {isPdf ? "PDF" : "Excel"}
    </span>
  );
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
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

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
      report.export_format,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const handleDownloadPdf = async (report: GeneratedReportRecord) => {
    const key = `${report.id}:pdf`;
    setDownloadingKey(key);
    try {
      await downloadGeneratedReportPdf(report);
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Failed to download PDF report."
      );
    } finally {
      setDownloadingKey(null);
    }
  };

  const handleDownloadExcel = (report: GeneratedReportRecord) => {
    const key = `${report.id}:excel`;
    setDownloadingKey(key);
    try {
      downloadGeneratedReportExcel(report);
    } catch (cause) {
      showError(
        cause instanceof Error ? cause.message : "Failed to download spreadsheet."
      );
    } finally {
      setDownloadingKey(null);
    }
  };

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
                  <th className="px-4 py-3 font-semibold">Format</th>
                  <th className="px-4 py-3 font-semibold">Actioned By</th>
                  <th className="px-4 py-3 font-semibold">Included Modules</th>
                  <th className="px-4 py-3 font-semibold">Projects Filter</th>
                  <th className="px-4 py-3 font-semibold">Downloads</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <tr key={report.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 text-slate-700">
                      {formatReportDate(report.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <FormatBadge format={report.export_format} />
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDownloadPdf(report)}
                          disabled={downloadingKey === `${report.id}:pdf`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {downloadingKey === `${report.id}:pdf` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                          PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadExcel(report)}
                          disabled={downloadingKey === `${report.id}:excel`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          {downloadingKey === `${report.id}:excel` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileSpreadsheet className="h-3.5 w-3.5" />
                          )}
                          Excel
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
