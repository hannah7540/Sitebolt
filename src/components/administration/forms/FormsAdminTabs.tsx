"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import FormTester, { FormTesterLaunchButton } from "@/components/administration/FormTester";

export type FormsAdminTab = "inductions" | "rfi" | "competencies" | "requests";

interface FormsAdminTabsProps {
  active: FormsAdminTab;
}

const TABS: { id: FormsAdminTab; label: string; href: string }[] = [
  { id: "inductions", label: "Inductions", href: "/admin/forms/inductions" },
  { id: "rfi", label: "RFI", href: "/admin/forms/rfi" },
  { id: "requests", label: "Requests", href: "/admin/forms/requests" },
  { id: "competencies", label: "Competencies", href: "/admin/forms/competencies" },
];

export default function FormsAdminTabs({ active }: FormsAdminTabsProps) {
  const [showFormTester, setShowFormTester] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Forms & Registers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage induction forms, RFI registers, worker requests, competency matrices, and worker form workflows.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              active === tab.id
                ? "bg-orange-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">
            Admin Form Testing Utility
          </p>
          <p className="text-xs text-violet-600">
            Temporary tool to validate Supabase insert paths for all worker/admin forms.
          </p>
        </div>
        <FormTesterLaunchButton onClick={() => setShowFormTester((open) => !open)} />
      </div>

      {showFormTester ? (
        <FormTester embedded onClose={() => setShowFormTester(false)} />
      ) : null}
    </div>
  );
}
