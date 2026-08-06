"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Package } from "lucide-react";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import type { PlantAsset, Worker } from "@/lib/supabase";
import {
  fetchDocumentPackData,
  logDocumentPackExport,
  type DocumentPackSection,
} from "@/lib/document-pack-service";
import { generateAndDownloadDocumentPack } from "@/lib/document-pack-pdf";
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
        "Completed and signed-off inspection test plans/checklists within the date range.",
    },
    {
      id: "swms",
      label: "SWMS",
      description:
        "Site-specific SWMS assigned to the project with worker sign-off records.",
    },
    {
      id: "plant",
      label: "Plant Equipment",
      description:
        "Assigned plant register with hours, service data, and maintenance history.",
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

  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [sections, setSections] = useState<Set<DocumentPackSection>>(
    new Set(["itps", "swms", "plant"])
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && activeProjects[0]?.id) {
      setProjectId(activeProjects[0].id);
    }
  }, [activeProjects, projectId]);

  const selectedProject = activeProjects.find((project) => project.id === projectId);

  const toggleSection = (section: DocumentPackSection) => {
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const handleGenerate = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!projectId.trim()) {
      setError("Select a project.");
      return;
    }
    if (!dateFrom || !dateTo) {
      setError("Select a date range.");
      return;
    }
    if (dateFrom > dateTo) {
      setError("Date From must be on or before Date To.");
      return;
    }
    if (sections.size === 0) {
      setError("Select at least one document type to include.");
      return;
    }

    setGenerating(true);
    try {
      const packData = await fetchDocumentPackData({
        projectId,
        projectName: selectedProject?.name ?? "Project",
        dateFrom,
        dateTo,
        sections: Array.from(sections),
        workers,
        plant,
      });

      const { fileName } = await generateAndDownloadDocumentPack(packData);

      const { error: logError } = await logDocumentPackExport({
        projectId,
        projectName: selectedProject?.name ?? "Project",
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
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          1-Click <span className="text-orange-500">Document Pack</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Build a unified PDF export of ITPs, SWMS sign-offs, and plant records for any
          project.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cn("space-y-6 p-6", cardClass)}>
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-orange-600">
              Step 1 — Select Project
            </p>
            <label className="block space-y-1">
              <span className={labelClass}>Active Project</span>
              <select
                className={inputClass}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {activeProjects.length === 0 ? (
                  <option value="">No active projects</option>
                ) : (
                  activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))
                )}
              </select>
            </label>
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
              Step 4 — Generate
            </p>
            <button
              type="button"
              disabled={generating || activeProjects.length === 0}
              onClick={() => void handleGenerate()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 py-4 text-base font-bold text-white hover:bg-orange-600 disabled:opacity-50 sm:w-auto"
            >
              {generating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <FileDown className="h-5 w-5" />
              )}
              Generate 1-Click PDF Pack
            </button>
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
              <dt className="text-slate-500">Project</dt>
              <dd className="font-medium text-slate-900">
                {selectedProject?.name ?? "—"}
              </dd>
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
            The PDF includes your organisation logo, a cover summary, and each selected
            section formatted for site records and client handover.
          </p>
        </aside>
      </div>
    </div>
  );
}
