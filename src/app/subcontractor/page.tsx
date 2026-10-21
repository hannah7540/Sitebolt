import { redirect } from "next/navigation";
import SubcontractorOverview from "@/components/subcontractors/SubcontractorOverview";
import { loadCurrentSubcontractorPortal } from "@/lib/subcontractor-portal";
import { cardClass } from "@/lib/ui-classes";

export const dynamic = "force-dynamic";

export default async function SubcontractorOverviewPage() {
  const { userId, record } = await loadCurrentSubcontractorPortal();

  if (!userId) {
    redirect("/login");
  }

  if (!record) {
    return (
      <section className={`${cardClass} p-8`}>
        <h2 className="text-lg font-bold text-slate-900">Profile not found</h2>
        <p className="mt-2 text-sm text-slate-500">
          We could not load a subcontractor record for this account. Complete onboarding
          from your invite email, then return here.
        </p>
      </section>
    );
  }

  return <SubcontractorOverview record={record} />;
}
