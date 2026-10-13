"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import SubcontractorsListView from "@/components/subcontractors/SubcontractorsListView";
import { readConsoleOpenAdd } from "@/lib/console-nav-routes";

function SubcontractorsPageContent() {
  const searchParams = useSearchParams();
  return <SubcontractorsListView initialShowAdd={readConsoleOpenAdd(searchParams)} />;
}

export default function SubcontractorsAdminPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading subcontractors…
        </div>
      }
    >
      <SubcontractorsPageContent />
    </Suspense>
  );
}
