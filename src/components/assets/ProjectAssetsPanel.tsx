"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, Search, Wrench, X } from "lucide-react";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  buildAssetProjectMap,
  fetchLaserSignouts,
  fetchProjectAssetAssignments,
  filterAssetsForProject,
  signInLaser,
  signOutLaser,
  updateAssetStatus,
  type Asset,
  type AssetLaserSignout,
  type AssetStatus,
} from "@/lib/assets";
import AssetServicingContactBox from "./AssetServicingContactBox";
import LaserStatusWidget from "./LaserStatusWidget";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type ProjectAssetsTab = "active" | "in_service";

interface ProjectAssetsPanelProps {
  projectId: string | null;
  projectName: string;
  assets: Asset[];
  loading: boolean;
  onRefresh: () => void;
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

export default function ProjectAssetsPanel({
  projectId,
  projectName,
  assets,
  loading,
  onRefresh,
}: ProjectAssetsPanelProps) {
  const [assetProjectMap, setAssetProjectMap] = useState<Map<string, string[]>>(new Map());
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProjectAssetsTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [signouts, setSignouts] = useState<AssetLaserSignout[]>([]);
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setAssignmentsLoading(true);
    const assignments = await fetchProjectAssetAssignments();
    setAssetProjectMap(buildAssetProjectMap(assignments));
    if (projectId) {
      const signoutRows = await fetchLaserSignouts(projectId);
      setSignouts(signoutRows);
    }
    setAssignmentsLoading(false);
  }, [projectId]);

  useEffect(() => {
    void loadData();
  }, [loadData, assets.length]);

  const assignedAssets = useMemo(() => {
    if (!projectId) return [];
    return filterAssetsForProject(assets, projectId, assetProjectMap);
  }, [assets, projectId, assetProjectMap]);

  const projectLasers = useMemo(
    () => assignedAssets.filter((a) => a.asset_type === "site_laser"),
    [assignedAssets]
  );

  const tabAssets = useMemo(() => {
    const status: AssetStatus =
      activeTab === "active" ? "active" : "in_service_calibration";
    return assignedAssets.filter((a) => a.status === status);
  }, [assignedAssets, activeTab]);

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return tabAssets;
    const q = searchQuery.toLowerCase().trim();
    return tabAssets.filter((item) => {
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
  }, [tabAssets, searchQuery]);

  const selectedAsset = useMemo(
    () => filteredAssets.find((a) => a.id === selectedAssetId) ?? null,
    [filteredAssets, selectedAssetId]
  );

  const handleToggleStatus = async (asset: Asset) => {
    setActionId(asset.id);
    const newStatus: AssetStatus =
      asset.status === "active" ? "in_service_calibration" : "active";
    const { error } = await updateAssetStatus(asset.id, newStatus);
    setActionId(null);
    if (error) {
      alert(error);
      return;
    }
    onRefresh();
  };

  const handleSignOut = async (asset: Asset) => {
    if (!projectId) return;
    const workerName = prompt("Worker name (optional):");
    setActionId(asset.id);
    const { error } = await signOutLaser(asset.id, projectId, workerName ?? undefined);
    setActionId(null);
    if (error) {
      alert(error);
      return;
    }
    await loadData();
  };

  const handleSignIn = async (signout: AssetLaserSignout) => {
    setActionId(signout.id);
    const { error } = await signInLaser(signout.id);
    setActionId(null);
    if (error) {
      alert(error);
      return;
    }
    await loadData();
  };

  const getActiveSignout = (assetId: string) =>
    signouts.find((s) => s.asset_id === assetId && !s.signed_in_at);

  if (!projectId) {
    return (
      <p className="text-sm text-slate-500">
        Select a project from the sidebar to manage assets.
      </p>
    );
  }

  if (selectedAsset) {
    const activeSignout = getActiveSignout(selectedAsset.id);

    return (
      <div>
        <button
          type="button"
          onClick={() => setSelectedAssetId(null)}
          className="mb-4 text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          ← Back to assets
        </button>

        <div className={`${cardClass} p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  {selectedAsset.asset_number} — {selectedAsset.name}
                </h1>
                <StatusBadge status={selectedAsset.status} />
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                  {ASSET_TYPE_LABELS[selectedAsset.asset_type]}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {[selectedAsset.make, selectedAsset.model].filter(Boolean).join(" ")}
                {selectedAsset.serial_number ? ` · S/N ${selectedAsset.serial_number}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {selectedAsset.asset_type === "site_laser" &&
                selectedAsset.next_service_due_date ? (
                  <span>Service due: {selectedAsset.next_service_due_date}</span>
                ) : null}
                {selectedAsset.next_calibration_due_date ? (
                  <span>Calibration due: {selectedAsset.next_calibration_due_date}</span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleToggleStatus(selectedAsset)}
                disabled={actionId === selectedAsset.id}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"
              >
                {actionId === selectedAsset.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wrench className="h-3.5 w-3.5" />
                )}
                {selectedAsset.status === "active"
                  ? "Move to Service/Calibration"
                  : "Return to Active Service"}
              </button>

              {selectedAsset.asset_type === "site_laser" &&
              selectedAsset.status === "active" ? (
                activeSignout ? (
                  <button
                    type="button"
                    onClick={() => void handleSignIn(activeSignout)}
                    disabled={actionId === activeSignout.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Sign In Laser
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSignOut(selectedAsset)}
                    disabled={actionId === selectedAsset.id}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    Sign Out Laser
                  </button>
                )
              ) : null}
            </div>
          </div>

          {activeSignout ? (
            <p className="mt-4 text-sm font-semibold text-orange-600">
              Signed out
              {activeSignout.worker_name ? ` by ${activeSignout.worker_name}` : ""} at{" "}
              {new Date(activeSignout.signed_out_at).toLocaleString()}
            </p>
          ) : null}

          <div className="mt-6">
            <AssetServicingContactBox asset={selectedAsset} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-orange-500">Project Assets</h1>
        <p className="text-sm text-slate-500">{projectName}</p>
      </div>

      <LaserStatusWidget lasers={projectLasers} signouts={signouts} />

      <div className="mb-4 flex gap-2 border-b border-slate-200">
        {(
          [
            { id: "active" as const, label: "Active Assets" },
            { id: "in_service" as const, label: "In Service / Calibration" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setSelectedAssetId(null);
            }}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-semibold transition",
              activeTab === tab.id
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assets…"
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

      {loading || assignmentsLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading assets…
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className={`${cardClass} p-8 text-center text-sm text-slate-500`}>
          {searchQuery
            ? "No assets match your search."
            : activeTab === "active"
              ? "No active assets assigned to this project."
              : "No assets currently in service or calibration."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAssets.map((asset) => {
            const activeSignout = getActiveSignout(asset.id);

            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => setSelectedAssetId(asset.id)}
                className={`${cardClass} w-full p-4 text-left transition hover:border-orange-200 hover:shadow-md`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
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
                    {asset.asset_type === "site_laser" && activeSignout ? (
                      <p className="mt-2 text-xs font-semibold text-orange-600">
                        Signed out
                        {activeSignout.worker_name ? ` by ${activeSignout.worker_name}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
