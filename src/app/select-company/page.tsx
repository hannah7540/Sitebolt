"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pencil, Plus, Zap } from "lucide-react";
import CompanyFeatureConfigModal from "@/components/organisation/CompanyFeatureConfigModal";
import { useOrganisationWorkspace } from "@/components/organisation/OrganisationWorkspaceProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSuperAdminAccount } from "@/lib/super-admin";
import { type WorkspaceCompany } from "@/lib/organisation-workspace";

export default function SelectCompanyPage() {
  const router = useRouter();
  const workspace = useOrganisationWorkspace();
  const [wizard, setWizard] = useState<{ mode: "create" | "edit"; company?: WorkspaceCompany } | null>(
    null
  );
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function guard() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        router.replace("/login");
        return;
      }
      const superAdmin = isSuperAdminAccount({
        email: user.email,
        metadata: user.user_metadata as Record<string, unknown>,
      });
      if (!superAdmin) {
        router.replace("/admin/dashboard");
        return;
      }
      if (!cancelled) setAllowed(true);
    }
    void guard();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const companies = workspace?.companies ?? [];

  const handleSaved = (company: WorkspaceCompany) => {
    setWizard(null);
    void workspace?.refreshCompanies();
    workspace?.selectCompany(company.id);
  };

  if (!allowed) {
    return <div className="min-h-screen bg-[#121417]" />;
  }

  return (
    <div className="min-h-screen bg-[#121417] px-4 py-12 text-white">
      <div className="mx-auto max-w-3xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF6B00]">
          Super-admin workspace
        </p>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold">Select a company</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Choose the workspace to open. You can switch companies later from the header.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWizard({ mode: "create" })}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FF6B00] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,107,0,0.35)] hover:bg-[#E65100]"
          >
            <Plus className="h-4 w-4" />
            + Add New Company
          </button>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {companies.map((company) => {
            const Icon = company.is_demo ? Zap : Building2;
            return (
              <div
                key={company.id}
                className="relative rounded-2xl border border-[#FF6B00]/20 bg-[#1F2429] p-5 text-left transition hover:border-[#FF6B00]"
              >
                <button
                  type="button"
                  onClick={() => workspace?.selectCompany(company.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3 pr-10">
                    <Icon className="h-6 w-6 text-[#FF6B00]" />
                    {company.is_demo ? (
                      <span className="rounded-full bg-[#FF6B00] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                        Demo Sandbox
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-4 text-lg font-bold">{company.company_name}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {company.is_demo ? "Mock data environment" : "Live production workspace"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setWizard({ mode: "edit", company });
                  }}
                  className="absolute right-4 top-4 rounded-lg border border-white/10 p-2 text-zinc-400 transition hover:border-[#FF6B00] hover:text-[#FF6B00]"
                  aria-label={`Edit configuration for ${company.company_name}`}
                  title="Edit Configuration"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setWizard({ mode: "create" })}
            className="rounded-2xl border border-dashed border-[#FF6B00]/40 bg-[#1F2429]/60 p-5 text-left hover:border-[#FF6B00]"
          >
            <Plus className="h-6 w-6 text-[#FF6B00]" />
            <p className="mt-4 text-lg font-bold">+ Add New Company</p>
            <p className="mt-1 text-xs text-zinc-400">Create and configure a new workspace</p>
          </button>
        </div>
      </div>

      {wizard ? (
        <CompanyFeatureConfigModal
          mode={wizard.mode}
          company={wizard.company}
          onClose={() => setWizard(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
