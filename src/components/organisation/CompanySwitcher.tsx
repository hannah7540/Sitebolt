"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, Zap } from "lucide-react";
import { useOrganisationWorkspace } from "@/components/organisation/OrganisationWorkspaceProvider";
import { shortCompanyLabel } from "@/lib/organisation-workspace";
import { cn } from "@/lib/utils";

export default function CompanySwitcher() {
  const workspace = useOrganisationWorkspace();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!workspace?.isSuperAdmin || !workspace.activeCompany) return null;

  const active = workspace.activeCompany;
  const Icon = active.is_demo ? Zap : Building2;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex max-w-[260px] items-center gap-2 rounded-full border border-[#FF6B00]/30 bg-[#1F2429] px-3 py-1.5 text-left text-xs font-semibold text-white hover:border-[#FF6B00]"
        aria-label="Switch company workspace"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#FF6B00]" />
        <span className="truncate">{shortCompanyLabel(active)}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-[#FF6B00]/20 bg-[#121417] shadow-xl">
          {workspace.companies.map((company) => (
            <button
              key={company.id}
              type="button"
              onClick={() => {
                setOpen(false);
                workspace.selectCompany(company.id);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm text-white hover:bg-[#1F2429]",
                company.id === active.id && "bg-[#1F2429]"
              )}
            >
              <span className="truncate">{company.company_name}</span>
              {company.is_demo ? (
                <span className="rounded-full bg-[#FF6B00] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Demo
                </span>
              ) : null}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/select-company");
            }}
            className="w-full border-t border-white/10 px-3 py-2.5 text-left text-sm font-semibold text-[#FF6B00] hover:bg-[#1F2429]"
          >
            All companies
          </button>
        </div>
      ) : null}
    </div>
  );
}
