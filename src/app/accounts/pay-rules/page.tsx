"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AccountsPayRules from "@/components/accounts/AccountsPayRules";
import { fetchWorkers, isSupabaseConfigured, type Worker } from "@/lib/supabase";
import {
  getAdminWorkerId,
  resolveAdminWorkerFromList,
} from "@/lib/user-session";
import {
  canAccessAccountsArea,
  normalizeAccountsAccessRole,
  normalizeSecurityRole,
} from "@/lib/security-roles";

function AccountsPayRulesContent() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [adminWorkerId, setAdminWorkerIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!isSupabaseConfigured()) {
        if (!cancelled) setLoading(false);
        return;
      }

      const workerData = await fetchWorkers();
      if (cancelled) return;

      setWorkers(workerData);
      const resolved =
        resolveAdminWorkerFromList(workerData) ??
        workerData[0]?.id ??
        getAdminWorkerId();
      setAdminWorkerIdState(resolved);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const accountsAccessRole = useMemo(() => {
    const linked = workers.find((worker) => worker.id === adminWorkerId);
    return normalizeAccountsAccessRole(linked?.accounts_access_role);
  }, [workers, adminWorkerId]);

  const sessionRole = useMemo(() => {
    const linked = workers.find((worker) => worker.id === adminWorkerId);
    return normalizeSecurityRole(linked?.security_role ?? "full_access");
  }, [workers, adminWorkerId]);

  const canAccessAccounts = useMemo(() => {
    const linked = workers.find((worker) => worker.id === adminWorkerId);
    return linked?.can_access_accounts === true;
  }, [workers, adminWorkerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading accounts session…
      </div>
    );
  }

  if (
    !canAccessAccountsArea({
      securityRole: sessionRole,
      accountsAccessRole,
      canAccessAccounts,
    })
  ) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Accounts access is disabled for your profile. Ask an administrator to enable
        Accounts Access in Organisation → Security Settings.
      </div>
    );
  }

  return <AccountsPayRules />;
}

export default function AccountsPayRulesPage() {
  return (
    <AdminConsoleShell requireAccountsAccess>
      <AccountsPayRulesContent />
    </AdminConsoleShell>
  );
}
