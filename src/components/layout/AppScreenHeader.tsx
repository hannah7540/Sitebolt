"use client";

import { HardHat } from "lucide-react";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

interface AppScreenHeaderProps {
  profileName?: string;
  profileActive?: boolean;
  onOpenProfile?: () => void;
  className?: string;
}

export default function AppScreenHeader({
  profileName = "Profile",
  profileActive = false,
  onOpenProfile,
  className,
}: AppScreenHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm lg:px-6",
        className
      )}
    >
      <CompanyLogo size="md" showFallback />
      {onOpenProfile ? (
        <button
          type="button"
          onClick={onOpenProfile}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-left transition",
            profileActive
              ? "border-orange-300 bg-orange-50"
              : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50"
          )}
          aria-label="Open my worker profile"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600">
            <HardHat className="h-4 w-4 text-white" />
          </span>
          <span className="hidden max-w-[140px] truncate text-sm font-semibold text-slate-900 sm:inline">
            {profileName}
          </span>
        </button>
      ) : null}
    </header>
  );
}
