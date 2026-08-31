"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  ASSET_STATUS_LABELS,
  addAsset,
  assignAssetToProject,
  buildAssetProjectMap,
  deleteAsset,
  fetchProjectAssetAssignments,
  getAssetAssignedProjectIds,
  getAssetPrimaryLabel,
  getAssetReferenceLabel,
  isMobileDeviceAssetType,
  isAssignedAccountsAssetType,
  updateAsset,
  type Asset,
  type AssetInput,
  type AssetStatus,
  type AssetType,
} from "@/lib/assets";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { fetchWorkers, type Worker } from "@/lib/supabase";
import AssetCategoryAccordionList from "./AssetCategoryAccordionList";
import AssetFormModal from "./AssetFormModal";
import AssetQRModal from "./AssetQRModal";
import AssignAssetToProjectModal from "./AssignAssetToProjectModal";
import { inputClass } from "@/lib/ui-classes";
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

function workerLabel(workers: Worker[], workerId: string | null | undefined): string {
  if (!workerId) return "—";
  const worker = workers.find((row) => row.id === workerId);
  return worker?.full_name?.trim() || worker?.email?.trim() || workerId;
}

function workersLabel(workers: Worker[], workerIds: string[]): string {
  if (!workerIds.length) return "—";
  return workerIds.map((id) => workerLabel(workers, id)).join(", ");
}

export default function AssetAdminPanel({
  assets,
  loading,
  onRefresh,
  initialShowAdd = false,
}: AssetAdminPanelProps) {
  const [assetList, setAssetList] = useState<Asset[]>(assets);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");
  const [showAddForm, setShowAddForm] = useState(initialShowAdd);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);
  const [assetProjectMap, setAssetProjectMap] = useState<Map<string, string[]>>(new Map());
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    setAssetList(assets);
  }, [assets]);

  useEffect(() => {
    if (initialShowAdd) setShowAddForm(true);
  }, [initialShowAdd]);

  useEffect(() => {
    void fetchWorkers().then(setWorkers);
  }, []);

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
      const account = (item.account_name ?? "").toLowerCase();
      const accountRef = (item.account_reference ?? "").toLowerCase();
      return (
        num.includes(q) ||
        name.includes(q) ||
        make.includes(q) ||
        model.includes(q) ||
        serial.includes(q) ||
        account.includes(q) ||
        accountRef.includes(q)
      );
    });
  }, [assetList, searchQuery, statusFilter]);

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

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteAsset = async (asset: Asset) => {
    const label = getAssetPrimaryLabel(asset);
    const confirmed = window.confirm(`Delete asset "${label}"? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(asset.id);
    const { error } = await deleteAsset(asset.id);
    setDeletingId(null);
    if (error) {
      window.alert(error);
      return;
    }
    setAssetList((prev) => prev.filter((row) => row.id !== asset.id));
    onRefresh();
  };

  const renderActionButtons = (asset: Asset) => (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setQrAsset(asset)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
      >
        <QrCode className="h-3.5 w-3.5" /> QR
      </button>
      <button
        type="button"
        onClick={() => {
          setEditAsset(asset);
          setShowAddForm(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
      >
        <Pencil className="h-3.5 w-3.5" /> Edit
      </button>
      <button
        type="button"
        onClick={() => setAssignAsset(asset)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600"
      >
        <Link2 className="h-3.5 w-3.5" /> Assign
      </button>
      <button
        type="button"
        onClick={() => void handleDeleteAsset(asset)}
        disabled={deletingId === asset.id}
        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {deletingId === asset.id ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Delete
      </button>
    </div>
  );

  const renderAssetRow = (asset: Asset, type: AssetType) => {
    const projectName = getProjectName(asset) ?? "—";
    const cellClass = "rounded-lg bg-white px-2 py-3 align-middle text-sm text-slate-700";
    const calibrationOrTest =
      asset.next_calibration_due_date || asset.next_service_due_date || "—";

    if (isMobileDeviceAssetType(type)) {
      return (
        <tr key={asset.id} className="align-top">
          <td className={cn(cellClass, "font-semibold text-slate-900")}>
            {asset.asset_number || getAssetPrimaryLabel(asset)}
          </td>
          <td className={cellClass}>{workerLabel(workers, asset.assigned_worker_id)}</td>
          <td className={cellClass}>{projectName}</td>
          <td className={cellClass}>{renderActionButtons(asset)}</td>
        </tr>
      );
    }

    if (type === "laser" || type === "pressure_gauge") {
      return (
        <tr key={asset.id} className="align-top">
          <td className={cn(cellClass, "font-semibold text-slate-900")}>
            {asset.serial_number || asset.asset_number || "—"}
          </td>
          <td className={cellClass}>{calibrationOrTest}</td>
          <td className={cellClass}>{projectName}</td>
          <td className={cellClass}>
            <StatusBadge status={asset.status} />
          </td>
          <td className={cellClass}>{renderActionButtons(asset)}</td>
        </tr>
      );
    }

    if (isAssignedAccountsAssetType(type)) {
      return (
        <tr key={asset.id} className="align-top">
          <td className={cn(cellClass, "font-semibold text-slate-900")}>
            {asset.account_name || asset.name}
          </td>
          <td className={cellClass}>{asset.account_reference || asset.asset_number}</td>
          <td className={cellClass}>{workersLabel(workers, asset.assigned_worker_ids)}</td>
          <td className={cellClass}>{renderActionButtons(asset)}</td>
        </tr>
      );
    }

    return (
      <tr key={asset.id} className="align-top">
        <td className={cn(cellClass, "font-semibold text-slate-900")}>
          {getAssetPrimaryLabel(asset)}
        </td>
        <td className={cellClass}>{renderActionButtons(asset)}</td>
      </tr>
    );
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-orange-500">Organisation Assets</h1>
        <p className="text-sm text-slate-500">
          Company-wide asset register grouped by type — laptops, iPads, lasers, pressure gauges, and assigned accounts.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search by ${getAssetReferenceLabel("laptop")}, worker, project, serial…`}
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
      ) : (
        <AssetCategoryAccordionList
          assets={filteredAssets}
          emptyMessage={
            searchQuery || statusFilter !== "all"
              ? "No assets match your search or filters."
              : "No assets registered yet. Add your first asset."
          }
          useTableLayout
          renderAsset={renderAssetRow}
        />
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
          assetLabel={getAssetPrimaryLabel(assignAsset)}
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
