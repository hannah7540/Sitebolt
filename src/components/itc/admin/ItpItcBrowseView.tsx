"use client";

import { ClipboardCheck, FileText, Search } from "lucide-react";
import {
  ADMIN_STATUS_CLASSES,
  ADMIN_STATUS_LABELS,
  formatAdminDate,
  type AdminBrowseItem,
} from "@/components/itc/admin/itp-itc-admin-api";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export type BrowseKindFilter = "itps" | "itcs" | "both";

interface ItpItcBrowseViewProps {
  items: AdminBrowseItem[];
  search: string;
  projectId: string;
  kind: BrowseKindFilter;
  projects: Array<{ id: string; name: string }>;
  loading?: boolean;
  onSearchChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onKindChange: (value: BrowseKindFilter) => void;
  onOpenItp: (id: string) => void;
  onOpenItc: (id: string) => void;
  onDeleteItem: (item: AdminBrowseItem) => void;
}

export default function ItpItcBrowseView({
  items,
  search,
  projectId,
  kind,
  projects,
  loading = false,
  onSearchChange,
  onProjectChange,
  onKindChange,
  onOpenItp,
  onOpenItc,
  onDeleteItem,
}: ItpItcBrowseViewProps) {
  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search title, ITC no, line number, location, contractor…"
              className={cn(inputClass, "pl-9")}
            />
          </label>
          <select
            value={projectId}
            onChange={(event) => onProjectChange(event.target.value)}
            className={inputClass}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-700">
          {(
            [
              ["itps", "ITPs"],
              ["itcs", "ITCs"],
              ["both", "Both"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={kind === value}
                onChange={() => onKindChange(value)}
                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={`${cardClass} p-8 text-sm text-slate-500`}>Loading ITPs and ITCs…</div>
      ) : items.length === 0 ? (
        <div className={`${cardClass} p-8 text-sm text-slate-500`}>
          No matching ITPs or ITCs. Adjust search filters or create a new plan.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              className={`${cardClass} p-4 text-left transition hover:border-orange-300 hover:shadow-md`}
            >
              <button
                type="button"
                onClick={() => (item.kind === "itp" ? onOpenItp(item.id) : onOpenItc(item.id))}
                className="w-full text-left"
              >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {item.kind === "itp" ? (
                      <ClipboardCheck className="h-3.5 w-3.5 text-orange-500" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 text-sky-500" />
                    )}
                    {item.kind === "itp" ? "ITP" : "ITC"} · {item.number}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-slate-900">{item.title}</h3>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    ADMIN_STATUS_CLASSES[item.status]
                  )}
                >
                  {ADMIN_STATUS_LABELS[item.status]}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <dt className="font-semibold text-slate-500">Project</dt>
                  <dd className="truncate">{item.project_name}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Area / Location</dt>
                  <dd className="truncate">{item.area || "—"}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">Date</dt>
                  <dd>{formatAdminDate(item.date)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-500">
                    {item.kind === "itc" ? "Line / Run" : "Contractor"}
                  </dt>
                  <dd className="truncate">
                    {item.kind === "itc" ? item.line_number || "—" : item.contractor || "—"}
                  </dd>
                </div>
              </dl>
              </button>
              <button
                type="button"
                onClick={() => onDeleteItem(item)}
                className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                {item.kind === "itp" ? "Delete ITP" : "Delete ITC"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
