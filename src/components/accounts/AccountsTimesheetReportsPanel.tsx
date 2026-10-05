"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  Loader2,
  Search,
  Download,
  X,
} from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import {
  fetchTimesheetAuditWorkers,
  formatAuditDate,
  formatAuditDateTime,
  formatHoursAllowancesPreview,
  formatSubmissionMethodLabel,
  generateTimesheetAuditReport,
  resolveTimesheetAuditPreset,
  TIMESHEET_AUDIT_PRESETS,
  type TimesheetAuditPreset,
  type TimesheetAuditReport,
  type TimesheetAuditWorkerOption,
} from "@/lib/timesheet-audit-report";
import {
  downloadTimesheetAuditPdf,
  generateTimesheetAuditPdf,
} from "@/lib/timesheet-audit-pdf";

function TimesheetReportWorkerCombobox({
  workers,
  selectedWorkerId,
  onSelectWorkerId,
  loading,
}: {
  workers: TimesheetAuditWorkerOption[];
  selectedWorkerId: string;
  onSelectWorkerId: (workerId: string) => void;
  loading: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedWorker = useMemo(
    () => workers.find((worker) => worker.id === selectedWorkerId) ?? null,
    [selectedWorkerId, workers]
  );
  const [query, setQuery] = useState(selectedWorker?.name ?? "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selectedWorker) {
      setQuery(selectedWorker.name);
    }
  }, [selectedWorker]);

  const filteredWorkers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return workers.filter((worker) => {
      const haystack = [
        worker.searchText,
        worker.name,
        worker.lastName,
        worker.email,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, workers]);

  const showMenu = open && query.trim().length >= 1;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        if (selectedWorker) {
          setQuery(selectedWorker.name);
        }
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [selectedWorker]);

  function selectWorker(worker: TimesheetAuditWorkerOption) {
    onSelectWorkerId(worker.id);
    setQuery(worker.name);
    setOpen(false);
  }

  function clearSelection() {
    onSelectWorkerId("");
    setQuery("");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div>
      <label className={labelClass} htmlFor="timesheet-report-worker-search">
        Worker
      </label>
      <div ref={containerRef} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id="timesheet-report-worker-search"
          ref={inputRef}
          className={cn(inputClass, "pl-9", selectedWorkerId ? "pr-9" : "")}
          placeholder="Search worker by name or email..."
          value={query}
          disabled={loading}
          autoComplete="off"
          role="combobox"
          aria-expanded={showMenu}
          aria-controls="timesheet-report-worker-results"
          aria-autocomplete="list"
          onFocus={() => {
            if (query.trim().length >= 1) setOpen(true);
          }}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(nextQuery.trim().length >= 1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              if (selectedWorker) setQuery(selectedWorker.name);
              return;
            }
            if (event.key === "Enter" && showMenu && filteredWorkers[0]) {
              event.preventDefault();
              selectWorker(filteredWorkers[0]);
            }
          }}
        />
        {selectedWorkerId ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear selected worker"
            onClick={clearSelection}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        {showMenu ? (
          <div
            id="timesheet-report-worker-results"
            role="listbox"
            className="absolute top-full z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          >
            {loading ? (
              <div className="px-3 py-2 text-sm text-slate-500">Loading workers…</div>
            ) : filteredWorkers.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-500">No matching workers</div>
            ) : (
              filteredWorkers.map((worker) => {
                const archived = worker.statusLabel !== "Active";
                const subtitle = worker.trade || worker.email || "—";
                const isSelected = worker.id === selectedWorkerId;
                return (
                  <button
                    key={worker.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-accent/15",
                      isSelected ? "bg-accent/10" : ""
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectWorker(worker)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-zinc-100">
                        {worker.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {subtitle}
                      </span>
                    </span>
                    {archived ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Archived
                      </span>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AccountsTimesheetReportsPanel() {
  const defaultRange = useMemo(
    () => resolveTimesheetAuditPreset("last_pay_period"),
    []
  );
  const [workers, setWorkers] = useState<TimesheetAuditWorkerOption[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [activePreset, setActivePreset] = useState<TimesheetAuditPreset | null>(
    "last_pay_period"
  );
  const [workersLoading, setWorkersLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState<TimesheetAuditReport | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  useEffect(() => {
    let cancelled = false;
    void fetchTimesheetAuditWorkers().then((result) => {
      if (cancelled) return;
      setWorkers(result.workers);
      setWorkersLoading(false);
      if (result.error) showError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  function applyPreset(preset: TimesheetAuditPreset) {
    const range = resolveTimesheetAuditPreset(preset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
    setActivePreset(preset);
  }

  async function handleGenerate() {
    if (!selectedWorkerId) {
      showError("Select a worker to generate the report.");
      return;
    }
    setGenerating(true);
    const result = await generateTimesheetAuditReport({
      workerId: selectedWorkerId,
      startDate,
      endDate,
    });
    setGenerating(false);
    if (result.error || !result.report) {
      setReport(null);
      showError(result.error ?? "Failed to generate the timesheet report.");
      return;
    }
    setReport(result.report);
    showSuccess(
      result.report.rows.length === 0
        ? "No submitted timesheets were found for this worker and date range."
        : `Loaded ${result.report.rows.length} timesheet submission${result.report.rows.length === 1 ? "" : "s"}.`
    );
  }

  async function handleExportPdf() {
    if (!report) {
      showError("Generate the report before exporting a PDF.");
      return;
    }
    setExporting(true);
    try {
      const { blob, fileName } = await generateTimesheetAuditPdf(report);
      downloadTimesheetAuditPdf(blob, fileName);
      showSuccess("Timesheet audit PDF downloaded.");
    } catch (error) {
      showError(
        error instanceof Error
          ? error.message
          : "Failed to export the timesheet audit PDF."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <AccountsNav />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timesheet Reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Generate a 7-year historical audit of actual submitted timesheets,
            including submission source and captured worker signatures.
          </p>
        </div>
      </div>

      <section className={cn(cardClass, "p-4")}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,0.8fr))]">
          <TimesheetReportWorkerCombobox
            workers={workers}
            selectedWorkerId={selectedWorkerId}
            onSelectWorkerId={setSelectedWorkerId}
            loading={workersLoading}
          />

          <div>
            <label className={labelClass} htmlFor="timesheet-report-start">
              Start Date
            </label>
            <input
              id="timesheet-report-start"
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setActivePreset(null);
              }}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="timesheet-report-end">
              End Date
            </label>
            <input
              id="timesheet-report-end"
              type="date"
              className={inputClass}
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setActivePreset(null);
              }}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TIMESHEET_AUDIT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition",
                activePreset === preset.id
                  ? "bg-orange-500 text-white ring-orange-500"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-orange-50 hover:text-orange-700"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating || workersLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Generate Report
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={!report || exporting}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export PDF
          </button>
        </div>
      </section>

      {report ? (
        <section className={cn(cardClass, "overflow-hidden")}>
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">
              {report.worker.name}
            </p>
            <p className="text-xs text-slate-500">
              {formatAuditDate(report.startDate)} to {formatAuditDate(report.endDate)}
              {" · "}
              Base {report.totals.baseHours.toFixed(1)}h
              {" · "}
              Overtime {report.totals.overtimeHours.toFixed(1)}h
              {" · "}
              Total {report.totals.totalHours.toFixed(1)}h
              {" · "}
              {report.rows.length} submission{report.rows.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-white text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Shift Date</th>
                  <th className="px-3 py-2 font-semibold">Submitted</th>
                  <th className="px-3 py-2 font-semibold">Method</th>
                  <th className="px-3 py-2 font-semibold">Site / Project</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Hours & Allowances</th>
                  <th className="px-3 py-2 font-semibold">Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {report.rows.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-sm text-slate-500"
                      colSpan={7}
                    >
                      No submitted timesheets were found for this worker and date
                      range.
                    </td>
                  </tr>
                ) : (
                  report.rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-3 text-slate-900">
                        {formatAuditDate(row.workDate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {formatAuditDateTime(row.submittedAt ?? row.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatSubmissionMethodLabel(row)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{row.projectName}</td>
                      <td className="px-3 py-3 text-slate-700">{row.role}</td>
                      <td className="whitespace-pre-line px-3 py-3 text-xs text-slate-700">
                        {formatHoursAllowancesPreview(row)}
                      </td>
                      <td className="px-3 py-3">
                        {row.signatureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.signatureUrl}
                            alt="Worker signature"
                            className="h-12 max-w-[9rem] rounded border border-slate-200 bg-white object-contain p-1"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">
                            {row.signatureLabel}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
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
