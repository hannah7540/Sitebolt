"use client";

import { useParams } from "next/navigation";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import InductionFormEditorShell from "@/components/administration/forms/InductionFormEditorShell";

export default function EditInductionFormPage() {
  const params = useParams();
  const formId = String(params.id ?? "");

  return (
    <AdminConsoleShell>
      <InductionFormEditorShell formId={formId || null} />
    </AdminConsoleShell>
  );
}
