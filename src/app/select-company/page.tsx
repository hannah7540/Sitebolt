"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Zap } from "lucide-react";
import AddCompanyModal from "@/components/organisation/AddCompanyModal";
import { useOrganisationWorkspace } from "@/components/organisation/OrganisationWorkspaceProvider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSuperAdminAccount } from "@/lib/super-admin";
import { type WorkspaceCompany } from "@/lib/organisation-workspace";

export default function SelectCompanyPage() {
  const router = useRouter();
  const workspace = useOrganisationWorkspace();
  const [showAdd, setShowAdd] = useState(false);
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

  const handleCreated = (company: WorkspaceCompany) => {
    setShowAdd(false);
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
        <h1 className="mt-2 text-3xl font-extrabold">Select a company</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Choose the workspace to open. You can switch companies later from the header.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {companies.map((company) => {
            const Icon = company.is_demo ? Zap : Building2;
            return (
              <button
                key={company.id}
                type="button"
                onClick={() => workspace?.selectCompany(company.id)}
                className="rounded-2xl border border-[#FF6B00]/20 bg-[#1F2429] p-5 text-left transition hover:border-[#FF6B00]"
              >
                <div className="flex items-start justify-between gap-3">
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
            );
          })}

          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded-2xl border border-dashed border-[#FF6B00]/40 bg-[#1F2429]/60 p-5 text-left hover:border-[#FF6B00]"
          >
            <Plus className="h-6 w-6 text-[#FF6B00]" />
            <p className="mt-4 text-lg font-bold">+ Add Another Company</p>
            <p className="mt-1 text-xs text-zinc-400">Create a new empty workspace</p>
          </button>
        </div>
      </div>

      {showAdd ? (
        <AddCompanyModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />
      ) : null}
    </div>
  );
}
