"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AdminConsoleViewGate from "@/components/layout/AdminConsoleViewGate";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { fetchPlant, type PlantAsset } from "@/lib/supabase";
import { DEFAULT_ADMIN_PROFILE_NAME } from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";

const DocumentPackView = dynamic(
  () => import("@/components/administration/DocumentPackView"),
  { ssr: false }
);

function AdminDocumentPackContent() {
  const { workers, projects, adminWorkerId } = useAdminConsole();
  const [plant, setPlant] = useState<PlantAsset[]>([]);

  useEffect(() => {
    void fetchPlant().then(setPlant);
  }, []);

  const exportedBy = workers.find((worker) => worker.id === adminWorkerId);

  return (
    <DocumentPackView
      projects={projects}
      workers={workers}
      plant={plant}
      exportedBy={exportedBy ? getWorkerDisplayName(exportedBy) : DEFAULT_ADMIN_PROFILE_NAME}
    />
  );
}

export default function AdminDocumentPackPage() {
  return (
    <AdminConsoleShell>
      <AdminConsoleViewGate>
        <AdminDocumentPackContent />
      </AdminConsoleViewGate>
    </AdminConsoleShell>
  );
}
