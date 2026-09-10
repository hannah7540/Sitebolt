"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import {
  fetchAllWorkers,
  isWorkerDeleted,
  type Worker,
} from "@/lib/supabase";
import { downloadWorkerArchiveExtract } from "@/lib/worker-archive-extract";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { ReportExportFormat } from "@/lib/generated-reports-service";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface EmployeeArchiveExtractPanelProps {
  actionedByName: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function EmployeeArchiveExtractPanel({
  actionedByName,
  onError,
  onSuccess,
}: EmployeeArchiveExtractPanelProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeCurrent, setIncludeCurrent] = useState(true);
  const [includePast, setIncludePast] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>("pdf");
  const [extracting, setExtracting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchAllWorkers({ includeDeleted: true }).then(({ workers: rows, error }) => {
      if (cancelled) return;
      setWorkers(rows);
      setLoading(false);
      if (error) onError(error);
    });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const selectableWorkers = useMemo(() => {
    return workers
      .filter((worker) => {
        const deleted = isWorkerDeleted(worker);
        if (includePast && !includeCurrent) return deleted;
        if (includeCurrent && !includePast) return !deleted;
        if (includeCurrent && includePast) return true;
        return false;
      })
      .sort((left, right) =>
        getWorkerDisplayName(left).localeCompare(getWorkerDisplayName(right), undefined, {
          sensitivity: "base",
        })
      );
  }, [workers, includeCurrent, includePast]);

  useEffect(() => {
    if (!selectedWorkerId) return;
    if (!selectableWorkers.some((worker) => worker.id === selectedWorkerId)) {
      setSelectedWorkerId("");
    }
  }, [selectableWorkers, selectedWorkerId]);

  const handleExtract = async () => {
    if (!selectedWorkerId) {
      onError("Select an employee before extracting data.");
      return;
    }

    setExtracting(true);
    try {
      const result = await downloadWorkerArchiveExtract(
        selectedWorkerId,
        exportFormat,
        actionedByName
      );
      if (result.error) {
        onError(result.error);
        return;
      }
      onSuccess(
        result.fileName
          ? `Employee archive downloaded as ${result.fileName}.`
          : "Employee archive downloaded."
      );
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Failed to extract employee archive."
      );
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className={cn(cardClass, "p-6")}>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">Employee Report</h2>
        <p className="mt-1 text-sm text-slate-500">
          Extract a complete historical record for a current or past employee, including
          profile details, licences, SWMS sign-offs, inductions, and leave.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] lg:items-end">
        <fieldset className="space-y-2">
          <legend className={labelClass}>Employee Status</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeCurrent}
              onChange={(event) => setIncludeCurrent(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            Current Employees
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includePast}
              onChange={(event) => setIncludePast(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            Past / Deleted Employees
          </label>
        </fieldset>

        <label className="block space-y-1">
          <span className={labelClass}>Employee</span>
          <select
            className={inputClass}
            value={selectedWorkerId}
            onChange={(event) => setSelectedWorkerId(event.target.value)}
            disabled={loading || selectableWorkers.length === 0}
          >
            <option value="">
              {loading
                ? "Loading employees…"
                : selectableWorkers.length === 0
                  ? "No employees match the selected status"
                  : "Select employee…"}
            </option>
            {selectableWorkers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {getWorkerDisplayName(worker)}
                {isWorkerDeleted(worker) ? " (Past)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => setExportFormat("pdf")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold",
                exportFormat === "pdf"
                  ? "bg-red-50 text-red-700"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={() => setExportFormat("excel")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold",
                exportFormat === "excel"
                  ? "bg-emerald-50 text-emerald-700"
                  : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleExtract()}
            disabled={extracting || !selectedWorkerId}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {extracting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Extract Data
          </button>
        </div>
      </div>
    </div>
  );
}
