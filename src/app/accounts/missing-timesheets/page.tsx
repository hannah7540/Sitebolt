"use client";

import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import AccountsMissingTimesheets from "@/components/accounts/AccountsMissingTimesheets";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import {
  canAccessAccountsArea,
  canViewAccountsTimesheets,
} from "@/lib/security-roles";

function AccountsMissingTimesheetsContent() {
  const {
    sessionRole,
    accountsAccessRole,
    canAccessAccounts,
    loading,
    sessionReady,
  } = useAdminConsole();

  if (loading || !sessionReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading accounts session…
      </div>
    );
  }

  if (
    !canViewAccountsTimesheets(sessionRole) &&
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

  return <AccountsMissingTimesheets />;
}

export default function AccountsMissingTimesheetsPage() {
  return (
    <AdminConsoleShell requireAccountsAccess>
      <AccountsMissingTimesheetsContent />
    </AdminConsoleShell>
  );
}
