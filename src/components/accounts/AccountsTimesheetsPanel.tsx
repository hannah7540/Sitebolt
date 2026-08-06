"use client";

import AccountsTimesheetsTab from "@/components/accounts/AccountsTimesheetsTab";
import type { AccountsAccessRole } from "@/lib/security-roles";

interface AccountsTimesheetsPanelProps {
  accountsAccessRole: AccountsAccessRole;
}

export default function AccountsTimesheetsPanel({
  accountsAccessRole,
}: AccountsTimesheetsPanelProps) {
  return <AccountsTimesheetsTab accountsAccessRole={accountsAccessRole} />;
}
