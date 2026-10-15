"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Loader2, Package } from "lucide-react";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import type { PlantAsset, Worker } from "@/lib/supabase";
import {
  fetchDocumentPackData,
  logDocumentPackExport,
  type DocumentPackData,
  type DocumentPackScope,
  type DocumentPackSection,
} from "@/lib/document-pack-service";
import { generateAndDownloadDocumentPack } from "@/lib/document-pack-pdf";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface DocumentPackViewProps {
  projects: DbProject[];
  workers: Worker[];
  plant: PlantAsset[];
  exportedBy?: string | null;
}

const SECTION_OPTIONS: Array<{ id: DocumentPackSection; label: string; description: string }> =
  [
    {
      id: "itps",
      label: "ITPs & ITCs",
      description:
        "All ITPs and ITCs for the selected scope in the date range, including draft, open, pending, and completed.",
    },
    {
      id: "swms",
      label: "SWMS",
      description:
        "SWMS documents with worker sign-off records for the selected company or project scope.",
    },
    {
      id: "plant",
      label: "Plant Equipment",
      description:
        "Plant register with hours, service data, and maintenance history for the selected scope.",
    },
  ];

export default function DocumentPackView({
  projects,
  workers,
  plant,
  exportedBy,
}: DocumentPackViewProps) {
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 8)}01`;

  const [scope, setScope] = useState<DocumentPackScope>("company");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [sections, setSections] = useState<Set<DocumentPackSection>>(
    new Set(["itps", "swms", "plant"])
  );
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const projectNamesById = useMemo(
    () =>
      Object.fromEntries(activeProjects.map((project) => [project.id, project.name])),
    [activeProjects]
  );

  const selectedProjects = activeProjects.filter((project) =>
    selectedProjectIds.includes(project.id)
  );
  const scopeLabel =
    scope === "company"
      ? "Company Wide"
      : selectedProjects.map((project) => project.name).join(", ") || "Specific Projects";

  const handleScopeChange = (next: DocumentPackScope) => {
    setScope(next);
    if (next === "company") {
      setSelectedProjectIds([]);
    }
  };

  const toggleSection = (section: DocumentPackSection) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const validateAndLoadPack = async (): Promise<DocumentPackData | null> => {
    setError(null);
    setSuccessMessage(null);

    if (scope === "projects" && selectedProjectIds.length === 0) {
      setError("Select at least one project.");
      return null;
    }
    if (!dateFrom || !dateTo) {
      setError("Select a date range.");
      return null;
    }
    if (dateFrom > dateTo) {
      setError("Date From must be on or before Date To.");
      return null;
    }
    if (sections.size === 0) {
      setError("Select at least one document type to include.");
      return null;
    }

    return fetchDocumentPackData({
      scope,
      projectIds: scope === "projects" ? selectedProjectIds : [],
      projectName: scopeLabel,
      projectNamesById,
      dateFrom,
      dateTo,
      sections: Array.from(sections),
      workers,
      plant,
    });
  };

  const handleExportPdf = async () => {
    setExporting("pdf");
    try {
      const packData = await validateAndLoadPack();
      if (!packData) return;

      const { fileName } = await generateAndDownloadDocumentPack(packData);
      const { error: logError } = await logDocumentPackExport({
        projectId: packData.projectId,
        projectName: packData.projectName,
        dateFrom,
        dateTo,
        sections: Array.from(sections),
        fileName,
        exportedBy,
      });

      if (logError) {
        setSuccessMessage(
          `${fileName} downloaded. Export log could not be saved: ${logError}`
        );
      } else {
        setSuccessMessage(`${fileName} generated and downloaded successfully.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate document pack.");
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    setExporting("excel");
    try {
      const packData = await validateAndLoadPack();
      if (!packData) return;

      const { buildDocumentPackExcelFileName, downloadDocumentPackExcel } =
        await import("@/lib/document-pack-xlsx");
      const fileName = buildDocumentPackExcelFileName(today);
      await downloadDocumentPackExcel(packData, fileName);

      const { error: logError } = await logDocumentPackExport({
        projectId: packData.projectId,
        projectName: packData.projectName,
        dateFrom,
        dateTo,
        sections: Array.from(sections),
        fileName,
        exportedBy,
      });

      if (logError) {
        setSuccessMessage(
          `${fileName} downloaded. Export log could not be saved: ${logError}`
        );
      } else {
        setSuccessMessage(`${fileName} downloaded successfully.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export Excel.");
    } finally {
      setExporting(null);
    }
  };

  const busy = exporting !== null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          1-Click <span className="text-orange-500">Document Pack</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Build a unified PDF or Excel export of ITPs, SWMS sign-offs, and plant records
          for the whole company or selected projects.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cn("space-y-6 p-6", cardClass)}>
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-600">
              Step 1 — Scope
            </p>
            <span className={labelClass}>Scope</span>
            <div className="mt-1 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => handleScopeChange("company")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold",
                  scope === "company"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Company Wide
              </button>
              <button
                type="button"
                onClick={() => handleScopeChange("projects")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-semibold",
                  scope === "projects"
                    ? "bg-white text-orange-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                Specific Projects
              </button>
            </div>
            {scope === "projects" ? (
              <div className="mt-3">
                <ProjectMultiSelect
                  projects={activeProjects}
                  selectedProjectIds={selectedProjectIds}
                  onChange={setSelectedProjectIds}
                  title="Active projects"
                  description="Choose one or more projects. Only documents linked to these project IDs will be included."
                  className="shadow-none"
                />
              </div>
            ) : null}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-600">
              Step 2 — Select Date Range
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={labelClass}>Date From</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Date To</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-orange-600">
              Step 3 — Select Document Types
            </p>
            <div className="space-y-3">
              {SECTION_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                    checked={sections.has(option.id)}
                    onChange={() => toggleSection(option.id)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-orange-600">
              Step 4 — Export
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleExportPdf()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {exporting === "pdf" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileDown className="h-5 w-5" />
                )}
                Export to PDF
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleExportExcel()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-4 text-base font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {exporting === "excel" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )}
                Export to Excel
              </button>
            </div>
          </section>

          {successMessage ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {successMessage}
            </p>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <aside className={cn("p-5", cardClass)}>
          <div className="mb-3 flex items-center gap-2 text-slate-900">
            <Package className="h-5 w-5 text-orange-500" />
            <h2 className="font-semibold">Pack Preview</h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Scope</dt>
              <dd className="font-medium text-slate-900">{scopeLabel}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Date Range</dt>
              <dd className="font-medium text-slate-900">
                {dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Sections</dt>
              <dd className="font-medium text-slate-900">
                {sections.size > 0
                  ? SECTION_OPTIONS.filter((option) => sections.has(option.id))
                      .map((option) => option.label)
                      .join(", ")
                  : "None selected"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            PDF is a single document with SWMS content and signature logs, one page per
            plant item, and ITCs as they appear on screen. Excel has three tabs: Plant,
            SWMS, and ITP-ITC.
          </p>
        </aside>
      </div>
    </div>
  );
}
