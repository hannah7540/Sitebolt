"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchInvitedSubcontractorByEmail } from "@/lib/subcontractor-onboarding";
import { cardClass } from "@/lib/ui-classes";

export default function SubcontractorDashboardPage() {
  const [email, setEmail] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const client = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await client.auth.getUser();
      const userEmail = user?.email?.trim() ?? "";
      if (cancelled) return;
      setEmail(userEmail);
      if (!userEmail) return;
      const invited = await fetchInvitedSubcontractorByEmail(userEmail);
      if (!cancelled && invited.record?.company_name) {
        setCompanyName(invited.record.company_name);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className={`${cardClass} mx-auto max-w-2xl p-8`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
          Subcontractor Portal
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Welcome{companyName ? ` to ${companyName}` : ""}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Your onboarding is complete
          {email ? (
            <>
              {" "}
              for <strong>{email}</strong>
            </>
          ) : null}
          . You can now manage workers, plant, and compliance from this portal.
        </p>
      </div>
    </div>
  );
}
