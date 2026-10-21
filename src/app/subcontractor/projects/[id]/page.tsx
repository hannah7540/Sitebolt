import Link from "next/link";
import { redirect } from "next/navigation";
import SubcontractorProjectDetail from "@/components/subcontractors/SubcontractorProjectDetail";
import { loadCurrentSubcontractorPortal } from "@/lib/subcontractor-portal";
import { fetchSubcontractorProjectWorkspace } from "@/lib/subcontractor-portal-projects";
import { cardClass } from "@/lib/ui-classes";

export const dynamic = "force-dynamic";

export default async function SubcontractorProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId, record } = await loadCurrentSubcontractorPortal();

  if (!userId) {
    redirect("/login");
  }

  if (!record?.id) {
    return (
      <section className={`${cardClass} p-8`}>
        <h2 className="text-lg font-bold text-slate-900">Profile not found</h2>
      </section>
    );
  }

  const workspace = await fetchSubcontractorProjectWorkspace(record.id, id);
  if (!workspace.project) {
    return (
      <section className={`${cardClass} p-8`}>
        <h2 className="text-lg font-bold text-slate-900">Project not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          This project is not assigned to your company.
        </p>
        <Link
          href="/subcontractor/projects"
          className="mt-4 inline-flex text-sm font-semibold text-orange-600"
        >
          Back to projects
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/subcontractor/projects" className="text-sm font-semibold text-orange-600">
        Back to projects
      </Link>
      <SubcontractorProjectDetail
        subcontractorId={record.id}
        project={workspace.project}
        projects={workspace.projects}
        workers={workspace.workers}
        plant={workspace.plant}
        assignedWorkers={workspace.assignedWorkers}
        assignedPlant={workspace.assignedPlant}
      />
    </div>
  );
}
