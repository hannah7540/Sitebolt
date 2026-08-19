"use client";

import SecuritySettingsPanel from "@/components/organisation/SecuritySettingsPanel";
import { fetchWorkers } from "@/lib/supabase";

export default function OrganisationSecurityPage() {
  return (
    <SecuritySettingsPanel
      onUpdated={() => {
        void fetchWorkers();
      }}
    />
  );
}
