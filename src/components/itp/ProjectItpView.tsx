"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import {
  ITP_STATUS_LABELS,
  ITP_TRADE_CATEGORIES,
  type ItpStatus,
} from "@/lib/itp-templates";
import {
  fetchItpDashboardStats,
  fetchProjectItps,
  type ItpDashboardStats,
  type ProjectItp,
} from "@/lib/itp-service";
import ItpCreateModal from "./ItpCreateModal";
import ItpInspectionView from "./ItpInspectionView";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ProjectItpViewProps {
  projectId: string | null;
  projectName: string;
  inspectorName?: string;
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  return (
    <div className={cn("flex items-center gap-4 p-5", cardClass)}>
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          tone === "warning" && "bg-red-100 text-red-600",
          tone === "success" && "bg-emerald-100 text-emerald-600",
          (!tone || tone === "default") && "bg-orange-100 text-orange-600"
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function printItpRegister(projectName: string, itps: ProjectItp[]) {
  const rows = itps
    .map(
      (itp) => `
      <tr>
        <td>${itp.itp_number}</td>
        <td>${itp.title}</td>
        <td>${itp.revision}</td>
        <td>${itp.trade_category}</td>
        <td>${itp.subcontractor_name ?? ""}</td>
        <td>${ITP_STATUS_LABELS[itp.status]}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html><html><head><title>ITP Register - ${projectName}</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 32px; color: #111; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      p { color: #666; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background: #f8fafc; }
    </style></head><body>
    <h1>ITP / ITC Register</h1>
    <p>${projectName} · Printed ${new Date().toLocaleString()}</p>
    <table>
      <thead><tr>
        <th>ITP #</th><th>Title</th><th>Rev</th><th>Trade</th><th>Subcontractor</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.print();
}

export default function ProjectItpView({
  projectId,
  projectName,
  inspectorName = "",
}: ProjectItpViewProps) {
  const [itps, setItps] = useState<ProjectItp[]>([]);
  const [stats, setStats] = useState<ItpDashboardStats>({
    totalItps: 0,
    openHoldPoints: 0,
    completedItps: 0,
    nonConformances: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ItpStatus | "all">("all");
  const [tradeFilter, setTradeFilter] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedItpId, setSelectedItpId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId) {
      setItps([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [rows, statRows] = await Promise.all([
      fetchProjectItps(projectId),
      fetchItpDashboardStats(projectId),
    ]);
    setItps(rows);
    setStats(statRows);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredItps = useMemo(() => {
    let list = itps;
    if (statusFilter !== "all") {
      list = list.filter((itp) => itp.status === statusFilter);
    }
    if (tradeFilter !== "all") {
      list = list.filter((itp) => itp.trade_category === tradeFilter);
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (itp) =>
        itp.itp_number.toLowerCase().includes(q) ||
        itp.title.toLowerCase().includes(q)
    );
  }, [itps, statusFilter, tradeFilter, searchQuery]);

  if (!projectId) {
    return (
      <p className="text-sm text-slate-500">
        Select a project from the sidebar to manage ITPs & ITCs.
      </p>
    );
  }

  if (selectedItpId) {
    return (
      <ItpInspectionView
        itpId={selectedItpId}
        inspectorName={inspectorName}
        onBack={() => setSelectedItpId(null)}
        onUpdated={() => void loadData()}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">ITPs & ITCs</h1>
          <p className="text-sm text-slate-500">{projectName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => printItpRegister(projectName, filteredItps)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" /> Print Register
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" /> Create New ITP / ITC
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total ITPs"
          value={stats.totalItps}
          icon={<ClipboardList className="h-5 w-5" />}
        />
        <StatCard
          label="Open Hold Points (H)"
          value={stats.openHoldPoints}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Completed ITPs"
          value={stats.completedItps}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Non-Conformances"
          value={stats.nonConformances}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ITP # or title…"
            className={`${inputClass} pl-9 pr-9`}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ItpStatus | "all")}
          className={`${inputClass} w-auto min-w-[160px]`}
        >
          <option value="all">All Statuses</option>
          {(Object.keys(ITP_STATUS_LABELS) as ItpStatus[]).map((status) => (
            <option key={status} value={status}>
              {ITP_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <select
          value={tradeFilter}
          onChange={(e) => setTradeFilter(e.target.value)}
          className={`${inputClass} w-auto min-w-[160px]`}
        >
          <option value="all">All Trades</option>
          {ITP_TRADE_CATEGORIES.map((trade) => (
            <option key={trade} value={trade}>
              {trade}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading ITP register…
        </div>
      ) : filteredItps.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-slate-500`}>
          {searchQuery || statusFilter !== "all" || tradeFilter !== "all"
            ? "No ITPs match your filters."
            : "No ITPs yet. Create one from a template or build a custom checklist."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItps.map((itp) => (
            <button
              key={itp.id}
              type="button"
              onClick={() => setSelectedItpId(itp.id)}
              className={`${cardClass} w-full p-4 text-left transition hover:border-orange-200 hover:shadow-md`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {itp.itp_number} — {itp.title}
                    </h3>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        itp.status === "approved" && "bg-emerald-100 text-emerald-800",
                        itp.status === "submitted" && "bg-blue-100 text-blue-800",
                        itp.status === "in_progress" && "bg-amber-100 text-amber-800",
                        itp.status === "draft" && "bg-slate-100 text-slate-700"
                      )}
                    >
                      {ITP_STATUS_LABELS[itp.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Rev {itp.revision} · {itp.trade_category}
                    {itp.subcontractor_name ? ` · ${itp.subcontractor_name}` : ""}
                    {itp.location_area ? ` · ${itp.location_area}` : ""}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate ? (
        <ItpCreateModal
          projectId={projectId}
          onClose={() => setShowCreate(false)}
          onCreated={() => void loadData()}
        />
      ) : null}
    </div>
  );
}
