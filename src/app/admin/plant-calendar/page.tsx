"use client";

import { useCallback, useEffect, useState } from "react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AdminConsoleViewGate from "@/components/layout/AdminConsoleViewGate";
import AdminPlantCalendarPanel from "@/components/administration/FullPlantCalendarView";
import { fetchPlant, type PlantAsset } from "@/lib/supabase";

function AdminPlantCalendarContent() {
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPlant = useCallback(async () => {
    setLoading(true);
    setPlant(await fetchPlant());
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPlant();
  }, [loadPlant]);

  return (
    <AdminPlantCalendarPanel plant={plant} loading={loading} onRefresh={loadPlant} />
  );
}

export default function AdminPlantCalendarPage() {
  return (
    <AdminConsoleShell>
      <AdminConsoleViewGate>
        <AdminPlantCalendarContent />
      </AdminConsoleViewGate>
    </AdminConsoleShell>
  );
}
