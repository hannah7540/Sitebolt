"use client";

import AccountsTimesheetsTab from "@/components/accounts/AccountsTimesheetsTab";
import type { AccountsAccessRole } from "@/lib/security-roles";

interface AccountsTimesheetsPanelProps {
  accountsAccessRole: AccountsAccessRole;
  readOnly?: boolean;
}

export default function AccountsTimesheetsPanel({
  accountsAccessRole,
  readOnly = false,
}: AccountsTimesheetsPanelProps) {
  return (
    <AccountsTimesheetsTab
      accountsAccessRole={accountsAccessRole}
      readOnly={readOnly}
    />
  );
}
