"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PlantAdminPanel from "@/components/plant/PlantAdminPanel";
import { fetchPlant, type PlantAsset } from "@/lib/supabase";
import { readConsoleOpenAdd } from "@/lib/console-nav-routes";

export default function OrganisationPlantPage() {
  const searchParams = useSearchParams();
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlant = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPlant();
      setPlant(rows ?? []);
    } catch (error) {
      console.error("Failed to load plant assets:", error);
      setPlant([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlant();
  }, [loadPlant]);

  return (
    <PlantAdminPanel
      plant={plant}
      loading={loading}
      onRefresh={() => void loadPlant()}
      initialShowAdd={readConsoleOpenAdd(searchParams)}
    />
  );
}
