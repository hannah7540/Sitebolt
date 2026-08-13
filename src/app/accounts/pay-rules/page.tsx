"use client";

import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AccountsPayRules from "@/components/accounts/AccountsPayRules";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { canAccessPayRules } from "@/lib/security-roles";

function AccountsPayRulesContent() {
  const { sessionRole, loading, sessionReady } = useAdminConsole();

  if (loading || !sessionReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading accounts session…
      </div>
    );
  }

  if (!canAccessPayRules(sessionRole)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Pay Rules are restricted to Owner and Full Access roles.
      </div>
    );
  }

  return <AccountsPayRules />;
}

export default function AccountsPayRulesPage() {
  return (
    <AdminConsoleShell requirePayRulesAccess>
      <AccountsPayRulesContent />
    </AdminConsoleShell>
  );
}
