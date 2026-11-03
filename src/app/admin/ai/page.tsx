"use client";

import { Suspense, lazy } from "react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import RouteLoadingFallback from "@/components/ui/RouteLoadingFallback";

const SiteBoltAIPage = lazy(() => import("@/components/ai/SiteBoltAIPage"));

export default function AdminAiChatRoute() {
  return (
    <AdminConsoleShell>
      <Suspense fallback={<RouteLoadingFallback label="Loading Site-Bolt AI…" dense />}>
        <SiteBoltAIPage />
      </Suspense>
    </AdminConsoleShell>
  );
}
