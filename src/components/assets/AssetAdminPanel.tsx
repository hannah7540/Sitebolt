"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Search,
  X,
} from "lucide-react";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  addAsset,
  assignAssetToProject,
  buildAssetProjectMap,
  fetchProjectAssetAssignments,
  getAssetAssignedProjectIds,
  updateAsset,
  type Asset,
  type AssetInput,
  type AssetStatus,
  type AssetType,
} from "@/lib/assets";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import AssetFormModal from "./AssetFormModal";
import AssetQRModal from "./AssetQRModal";
import AssignAssetToProjectModal from "./AssignAssetToProjectModal";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AssetAdminPanelProps {
  assets: Asset[];
  loading: boolean;
  onRefresh: () => void;
  initialShowAdd?: boolean;
}

function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs font-bold uppercase tracking-wide",
        status === "active"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-amber-100 text-amber-800"
      )}
    >
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

export default function AssetAdminPanel({
  assets,
  loading,
  onRefresh,
  initialShowAdd = false,
}: AssetAdminPanelProps) {
  const [assetList, setAssetList] = useState<Asset[]>(assets);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<AssetType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");
  const [showAddForm, setShowAddForm] = useState(initialShowAdd);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);
  const [assetProjectMap, setAssetProjectMap] = useState<Map<string, string[]>>(new Map());
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());

  useEffect(() => {
    setAssetList(assets);
  }, [assets]);

  useEffect(() => {
    if (initialShowAdd) setShowAddForm(true);
  }, [initialShowAdd]);

  const loadAssignments = useCallback(async () => {
    await fetchProjects();
    setProjects(getCachedProjects());
    const assignments = await fetchProjectAssetAssignments();
    setAssetProjectMap(buildAssetProjectMap(assignments));
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments, assets.length]);

  const filteredAssets = useMemo(() => {
    let list = assetList;

    if (typeFilter !== "all") {
      list = list.filter((a) => a.asset_type === typeFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((item) => {
      const num = item.asset_number.toLowerCase();
      const name = item.name.toLowerCase();
      const make = (item.make ?? "").toLowerCase();
      const model = (item.model ?? "").toLowerCase();
      const serial = (item.serial_number ?? "").toLowerCase();
      return (
        num.includes(q) ||
        name.includes(q) ||
        make.includes(q) ||
        model.includes(q) ||
        serial.includes(q)
      );
    });
  }, [assetList, searchQuery, typeFilter, statusFilter]);

  const getProjectName = (asset: Asset) => {
    const ids = getAssetAssignedProjectIds(
      asset,
      assetProjectMap.get(asset.id) ?? []
    );
    if (ids.length === 0) return null;
    return projects.find((p) => p.id === ids[0])?.name ?? ids[0];
  };

  const handleSaveAsset = async (input: AssetInput) => {
    if (editAsset) {
      const { error, asset: updated } = await updateAsset(editAsset.id, input);
      if (!error && updated) {
        setAssetList((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        onRefresh();
      }
      return { error };
    }
    const { error } = await addAsset(input);
    if (!error) onRefresh();
    return { error };
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-orange-500">Organisation Assets</h1>
        <p className="text-sm text-slate-500">
          Manage Site Lasers and Pressure Gauges with inline service and calibration contacts.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Asset #, Name, Make, Model, Serial #…"
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
        <button
          type="button"
          onClick={() => {
            setEditAsset(null);
            setShowAddForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" /> Add Asset
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AssetType | "all")}
          className={`${inputClass} w-auto min-w-[160px]`}
        >
          <option value="all">All Types</option>
          {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => (
            <option key={type} value={type}>
              {ASSET_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssetStatus | "all")}
          className={`${inputClass} w-auto min-w-[180px]`}
        >
          <option value="all">All Statuses</option>
          {(Object.keys(ASSET_STATUS_LABELS) as AssetStatus[]).map((status) => (
            <option key={status} value={status}>
              {ASSET_STATUS_LABELS[status]}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading assets…
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-slate-500`}>
          {searchQuery || typeFilter !== "all" || statusFilter !== "all"
            ? "No assets match your search or filters."
            : "No assets registered yet. Add your first Site Laser or Pressure Gauge."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAssets.map((asset) => (
            <div key={asset.id} className={`${cardClass} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {asset.asset_number} — {asset.name}
                    </h3>
                    <StatusBadge status={asset.status} />
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      {ASSET_TYPE_LABELS[asset.asset_type]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {[asset.make, asset.model].filter(Boolean).join(" ")}
                    {asset.serial_number ? ` · S/N ${asset.serial_number}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {asset.asset_type === "site_laser" && asset.next_service_due_date ? (
                      <span>Service due: {asset.next_service_due_date}</span>
                    ) : null}
                    {asset.next_calibration_due_date ? (
                      <span>Calibration due: {asset.next_calibration_due_date}</span>
                    ) : null}
                    {getProjectName(asset) ? (
                      <span className="text-orange-600">Assigned: {getProjectName(asset)}</span>
                    ) : (
                      <span className="text-slate-400">Unassigned</span>
                    )}
                  </div>
                  {asset.service_contact_company || asset.service_contact_name ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Contact:{" "}
                      {[asset.service_contact_company, asset.service_contact_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setQrAsset(asset)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
                  >
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditAsset(asset);
                      setShowAddForm(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignAsset(asset)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Assign
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddForm ? (
        <AssetFormModal
          asset={editAsset}
          onClose={() => {
            setShowAddForm(false);
            setEditAsset(null);
          }}
          onSave={handleSaveAsset}
        />
      ) : null}

      {qrAsset ? (
        <AssetQRModal asset={qrAsset} onClose={() => setQrAsset(null)} />
      ) : null}

      {assignAsset ? (
        <AssignAssetToProjectModal
          assetLabel={`${assignAsset.asset_number} — ${assignAsset.name}`}
          currentProjectId={
            getAssetAssignedProjectIds(
              assignAsset,
              assetProjectMap.get(assignAsset.id) ?? []
            )[0] ?? null
          }
          onClose={() => setAssignAsset(null)}
          onSave={async (projectId) => {
            const { error } = await assignAssetToProject(assignAsset.id, projectId);
            if (!error) {
              await loadAssignments();
              onRefresh();
            }
            return { error };
          }}
        />
      ) : null}
    </div>
  );
}
