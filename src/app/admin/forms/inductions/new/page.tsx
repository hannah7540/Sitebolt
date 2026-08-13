"use client";

import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import InductionFormEditorShell from "@/components/administration/forms/InductionFormEditorShell";

export default function NewInductionFormPage() {
  return (
    <AdminConsoleShell>
      <InductionFormEditorShell />
    </AdminConsoleShell>
  );
}
