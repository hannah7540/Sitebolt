"use client";

import { Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";

function ItcFallback() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
      Loading ITP / ITC module…
    </div>
  );
}

export default function AdministrationItcLayout({ children }: { children: ReactNode }) {
  return (
    <AdminConsoleShell>
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Suspense fallback={<ItcFallback />}>{children}</Suspense>
      </div>
    </AdminConsoleShell>
  );
}
