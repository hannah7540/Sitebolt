"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import SiteBoltAIPage from "@/components/ai/SiteBoltAIPage";

export default function AdminAiChatRoute() {
  return (
    <AdminConsoleShell>
      <SiteBoltAIPage />
    </AdminConsoleShell>
  );
}
