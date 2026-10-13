"use client";

import CompanyLogo from "@/components/ui/CompanyLogo";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import GlobalSearchBar from "@/components/search/GlobalSearchBar";
import CompanySwitcher from "@/components/organisation/CompanySwitcher";
import { cn } from "@/lib/utils";

interface AppScreenHeaderProps {
  className?: string;
}

export default function AppScreenHeader({ className }: AppScreenHeaderProps) {
  return (
    <header
      className={cn(
        "mobile-safe-area-y sticky top-0 z-30 hidden grid-cols-[minmax(0,1fr)_minmax(20rem,36rem)_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm lg:grid lg:px-6",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        <CompanyLogo size="md" showFallback />
        <CompanySwitcher />
      </div>
      <div className="w-full justify-self-center">
        <GlobalSearchBar />
      </div>
      <div className="flex items-center justify-end gap-2 justify-self-end">
        <span className="text-sm font-semibold tracking-wide text-slate-800">Site-Bolt</span>
        <SiteBoltMark className="h-8 w-8" />
      </div>
    </header>
  );
}
