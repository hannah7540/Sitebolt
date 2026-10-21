import Link from "next/link";
import type { SubcontractorPortalProject } from "@/lib/subcontractor-portal-models";
import { cardClass } from "@/lib/ui-classes";

export default function SubcontractorProjectsList({
  projects,
}: {
  projects: SubcontractorPortalProject[];
}) {
  if (projects.length === 0) {
    return (
      <section className={`${cardClass} p-8`}>
        <h2 className="text-lg font-bold text-slate-900">No assigned projects</h2>
        <p className="mt-2 text-sm text-slate-500">
          You will see projects here once the head contractor assigns your company to a site.
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/subcontractor/projects/${project.id}`}
          className={`${cardClass} block p-6 transition hover:border-orange-300 hover:shadow-md`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            Project
          </p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{project.name}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {project.location || "Location to be confirmed"}
          </p>
        </Link>
      ))}
    </div>
  );
}
