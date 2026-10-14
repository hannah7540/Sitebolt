import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import InductionFormEditorShell from "@/components/administration/forms/InductionFormEditorShell";

interface EditInductionFormPageProps {
  params: Promise<{ id: string | string[] }>;
}

function readFormId(id: string | string[] | undefined): string {
  if (Array.isArray(id)) return String(id[0] ?? "").trim();
  return String(id ?? "").trim();
}

export default async function EditInductionFormPage({
  params,
}: EditInductionFormPageProps) {
  const { id } = await params;
  const formId = readFormId(id);

  return (
    <AdminConsoleShell>
      <InductionFormEditorShell formId={formId || null} />
    </AdminConsoleShell>
  );
}
