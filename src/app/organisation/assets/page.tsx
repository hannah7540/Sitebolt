"use client";

import { useCallback, useEffect, useState } from "react";
import AssetAdminPanel from "@/components/assets/AssetAdminPanel";
import { fetchAssets, type Asset } from "@/lib/assets";

export default function OrganisationAssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAssets();
      setAssets(rows ?? []);
    } catch (error) {
      console.error("Failed to load assets:", error);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  return (
    <AssetAdminPanel assets={assets} loading={loading} onRefresh={() => void loadAssets()} />
  );
}
