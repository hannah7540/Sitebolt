"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import EmailsModulePanel from "@/components/emails/EmailsModulePanel";

export default function EmailsPage() {
  return (
    <AdminConsoleShell requireEmailsAccess>
      <EmailsModulePanel />
    </AdminConsoleShell>
  );
}
