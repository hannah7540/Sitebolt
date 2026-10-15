"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Eye,
  Loader2,
  Search,
} from "lucide-react";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export type ComplianceTrackingKind = "swms" | "induction";

export interface ComplianceTrackingRow {
  id: string;
  documentId: string;
  documentTitle: string;
  workerId: string;
  workerName: string;
  assignedAt: string | null;
  completedAt: string | null;
  status: "Completed" | "Pending";
  canRemind: boolean;
  isGuest?: boolean;
}

interface ComplianceTrackingPanelProps {
  kind: ComplianceTrackingKind;
  title?: string;
  rows: ComplianceTrackingRow[];
  loading?: boolean;
  error?: string | null;
  remindingId?: string | null;
  remindingAll?: boolean;
  onViewResults: (row: ComplianceTrackingRow) => void;
  onRemind: (row: ComplianceTrackingRow) => void;
  onRemindAllPending: (pendingRows: ComplianceTrackingRow[]) => void;
}

type StatusTab = "all" | "completed" | "pending";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ComplianceTrackingPanel({
  kind,
  title = "Compliance tracking",
  rows,
  loading = false,
  error = null,
  remindingId = null,
  remindingAll = false,
  onViewResults,
  onRemind,
  onRemindAllPending,
}: ComplianceTrackingPanelProps) {
  const [tab, setTab] = useState<StatusTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [documentId, setDocumentId] = useState("");

  const documents = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.documentId)) seen.set(row.documentId, row.documentTitle);
    }
    return Array.from(seen, ([id, label]) => ({ id, label }));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (documentId) list = list.filter((row) => row.documentId === documentId);
    if (tab === "completed") list = list.filter((row) => row.status === "Completed");
    if (tab === "pending") list = list.filter((row) => row.status === "Pending");
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (row) =>
        row.workerName.toLowerCase().includes(needle) ||
        row.documentTitle.toLowerCase().includes(needle)
    );
  }, [rows, documentId, tab, searchQuery]);

  const pendingCount = filtered.filter(
    (row) => row.status === "Pending" && row.canRemind
  ).length;
  const completedCount = filtered.filter((row) => row.status === "Completed").length;
  const noun = kind === "swms" ? "SWMS" : "induction";

  return (
    <section className={cn(cardClass, "p-5")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Assigned workers, completion status, submitted results, and reminders for this{" "}
            {noun}.
          </p>
        </div>
        <button
          type="button"
          disabled={pendingCount === 0 || remindingAll}
          onClick={() =>
            onRemindAllPending(
              filtered.filter((row) => row.status === "Pending" && row.canRemind)
            )
          }
          className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
        >
          {remindingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          Send Reminder to All Pending
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Assigned
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{filtered.length}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Completed
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{completedCount}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
            Pending
          </p>
          <p className="mt-1 text-2xl font-bold text-orange-800">{pendingCount}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {([
            ["all", "All"],
            ["completed", "Completed"],
            ["pending", "Pending"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                tab === value
                  ? "bg-white text-orange-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className={cn(inputClass, "max-w-xs")}
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
          aria-label={`Filter by ${noun}`}
        >
          <option value="">All {kind === "swms" ? "SWMS documents" : "inductions"}</option>
          {documents.map((doc) => (
            <option key={doc.id} value={doc.id}>
              {doc.label}
            </option>
          ))}
        </select>
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search worker or document…"
            className={cn(inputClass, "pl-9")}
          />
        </label>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading assignment records…
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {rows.length === 0
            ? `No workers have been assigned this ${noun} yet.`
            : "No assignments match your filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Worker Name</th>
                <th className="px-3 py-2 font-semibold">
                  {kind === "swms" ? "SWMS" : "Induction"}
                </th>
                <th className="px-3 py-2 font-semibold">Assigned Date</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Completion Date</th>
                <th className="px-3 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const completed = row.status === "Completed";
                const busy = remindingId === row.id || remindingAll;
                return (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 font-medium text-slate-900">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {row.workerName}
                        {row.isGuest ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                            Guest
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.documentTitle}</td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(row.assignedAt)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                          completed
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-orange-100 text-orange-800"
                        )}
                      >
                        {completed ? <CheckCircle2 className="h-3 w-3" /> : null}
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(row.completedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      {completed ? (
                        <button
                          type="button"
                          onClick={() => onViewResults(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600"
                        >
                          <Eye className="h-3 w-3" />
                          View Results
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || !row.canRemind}
                          onClick={() => onRemind(row)}
                          className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Bell className="h-3 w-3" />
                          )}
                          Send Reminder
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
