"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import SmsModulePanel from "@/components/sms/SmsModulePanel";

export default function SmsPage() {
  return (
    <AdminConsoleShell requireEmailsAccess>
      <SmsModulePanel />
    </AdminConsoleShell>
  );
}
