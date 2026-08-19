"use client";

import { useCallback, useEffect, useState } from "react";
import OrganisationProfileDashboard from "@/components/dashboard/OrganisationProfileDashboard";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { fetchAssets, type Asset } from "@/lib/assets";
import { fetchPlant, type PlantAsset } from "@/lib/supabase";

export default function OrganisationDashboardPage() {
  const { workers, loading, adminWorkerId, sessionRole } = useAdminConsole();
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [resourceLoading, setResourceLoading] = useState(true);

  const loadResources = useCallback(async () => {
    setResourceLoading(true);
    try {
      const [plantRows, assetRows] = await Promise.all([fetchPlant(), fetchAssets()]);
      setPlant(plantRows ?? []);
      setAssets(assetRows ?? []);
    } catch (error) {
      console.error("Failed to load organisation dashboard resources:", error);
      setPlant([]);
      setAssets([]);
    } finally {
      setResourceLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  return (
    <OrganisationProfileDashboard
      workers={workers}
      plant={plant}
      assets={assets}
      loading={loading || resourceLoading}
      userId={adminWorkerId}
      sessionRole={sessionRole}
    />
  );
}
