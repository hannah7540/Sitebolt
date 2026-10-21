import { redirect } from "next/navigation";
import SubcontractorWorkersPanel from "@/components/subcontractors/SubcontractorWorkersPanel";
import {
  fetchSubcontractorPortalWorkers,
  loadCurrentSubcontractorPortal,
} from "@/lib/subcontractor-portal";
import { cardClass } from "@/lib/ui-classes";

export const dynamic = "force-dynamic";

export default async function SubcontractorWorkersPage() {
  const { userId, record } = await loadCurrentSubcontractorPortal();

  if (!userId) {
    redirect("/login");
  }

  if (!record?.id) {
    return (
      <section className={`${cardClass} p-8`}>
        <h2 className="text-lg font-bold text-slate-900">Profile not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          We could not load a subcontractor record for this account.
        </p>
      </section>
    );
  }

  const workers = await fetchSubcontractorPortalWorkers(record.id);

  return (
    <SubcontractorWorkersPanel
      subcontractorId={record.id}
      organisationId={record.organisation_id || undefined}
      workers={workers}
    />
  );
}
