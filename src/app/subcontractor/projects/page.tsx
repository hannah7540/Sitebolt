import { redirect } from "next/navigation";
import SubcontractorProjectsList from "@/components/subcontractors/SubcontractorProjectsList";
import { loadCurrentSubcontractorPortal } from "@/lib/subcontractor-portal";
import { fetchSubcontractorAssignedProjects } from "@/lib/subcontractor-portal-projects";
import { cardClass } from "@/lib/ui-classes";

export const dynamic = "force-dynamic";

export default async function SubcontractorProjectsPage() {
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

  const projects = await fetchSubcontractorAssignedProjects(record.id);
  return <SubcontractorProjectsList projects={projects} />;
}
