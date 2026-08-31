"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ASSET_STATUS_LABELS,
  fetchAssetById,
  getAssetTypeLabel,
  isLaserAssetType,
  signInLaser,
  signOutLaser,
  fetchLaserSignouts,
  getActiveLaserSignouts,
  type Asset,
} from "@/lib/assets";
import { drawQrToCanvas, getAssetScanUrl } from "@/lib/qr-code";
import { cardClass } from "@/lib/ui-classes";

interface ScanAssetPageProps {
  assetId: string;
}

export default function ScanAssetPageClient({ assetId }: ScanAssetPageProps) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [activeSignoutId, setActiveSignoutId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const row = await fetchAssetById(assetId);
      if (!row) {
        setError("Asset not found");
        setLoading(false);
        return;
      }
      setAsset(row);

      if (isLaserAssetType(row.asset_type) && row.assigned_project_id) {
        const signouts = await fetchLaserSignouts(row.assigned_project_id);
        const active = getActiveLaserSignouts(
          signouts.filter((s) => s.asset_id === row.id)
        );
        setActiveSignoutId(active[0]?.id ?? null);
      }

      setLoading(false);
    })();
  }, [assetId]);

  useEffect(() => {
    if (canvasRef.current && asset) {
      drawQrToCanvas(canvasRef.current, getAssetScanUrl(asset.id), 160);
    }
  }, [asset]);

  const handleSignOut = async () => {
    if (!asset?.assigned_project_id) return;
    setActionLoading(true);
    const { error: signError } = await signOutLaser(
      asset.id,
      asset.assigned_project_id,
      workerName || undefined
    );
    setActionLoading(false);
    if (signError) {
      alert(signError);
      return;
    }
    const signouts = await fetchLaserSignouts(asset.assigned_project_id);
    const active = getActiveLaserSignouts(
      signouts.filter((s) => s.asset_id === asset.id)
    );
    setActiveSignoutId(active[0]?.id ?? null);
  };

  const handleSignIn = async () => {
    if (!activeSignoutId) return;
    setActionLoading(true);
    const { error: signError } = await signInLaser(activeSignoutId);
    setActionLoading(false);
    if (signError) {
      alert(signError);
      return;
    }
    setActiveSignoutId(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error || !asset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
        <div className={`${cardClass} max-w-md p-8 text-center`}>
          <p className="text-slate-600">{error ?? "Asset not found"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-6">
      <div className="mx-auto max-w-md">
        <div className={`${cardClass} p-6`}>
          <p className="text-xs font-bold uppercase tracking-widest text-orange-500">
            SiteBolt Asset
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {asset.asset_number}
          </h1>
          {asset.name.trim() &&
          asset.name.trim() !== asset.asset_number.trim() ? (
            <p className="text-slate-600">{asset.name}</p>
          ) : null}
          <p className="mt-1 text-sm text-slate-500">
            {getAssetTypeLabel(asset.asset_type)} · {ASSET_STATUS_LABELS[asset.status]}
          </p>

          <div className="my-4 flex justify-center">
            <canvas ref={canvasRef} width={160} height={160} aria-hidden />
          </div>

          {[asset.make, asset.model].filter(Boolean).length > 0 ? (
            <p className="text-sm text-slate-600">
              {[asset.make, asset.model].filter(Boolean).join(" ")}
            </p>
          ) : null}
          {asset.serial_number ? (
            <p className="text-sm text-slate-500">S/N {asset.serial_number}</p>
          ) : null}

          {isLaserAssetType(asset.asset_type) && asset.assigned_project_id ? (
            <div className="mt-6 space-y-3 border-t border-slate-200 pt-4">
              <p className="text-sm font-semibold text-slate-800">Laser Sign Out / In</p>
              {activeSignoutId ? (
                <button
                  type="button"
                  onClick={() => void handleSignIn()}
                  disabled={actionLoading}
                  className="w-full rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Sign In Laser
                </button>
              ) : (
                <>
                  <input
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="Your name (optional)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={actionLoading}
                    className="w-full rounded-lg bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    Sign Out Laser
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
