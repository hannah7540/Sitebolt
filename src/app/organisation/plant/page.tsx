"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import PlantAdminPanel from "@/components/plant/PlantAdminPanel";
import { fetchPlant, type PlantAsset } from "@/lib/supabase";

function OrganisationPlantContent() {
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
    <PlantAdminPanel plant={plant} loading={loading} onRefresh={() => void loadPlant()} />
  );
}

export default function OrganisationPlantPage() {
  return (
    <AdminConsoleShell requireOrganisationAccess>
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading plant…
          </div>
        }
      >
        <OrganisationPlantContent />
      </Suspense>
    </AdminConsoleShell>
  );
}
