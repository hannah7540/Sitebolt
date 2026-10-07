"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import CompanyLogo from "@/components/ui/CompanyLogo";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import { useCommandPalette } from "@/components/command-palette/CommandPaletteProvider";
import GlobalSearchBar from "@/components/search/GlobalSearchBar";
import CompanySwitcher from "@/components/organisation/CompanySwitcher";
import { cn } from "@/lib/utils";

interface AppScreenHeaderProps {
  profileName?: string;
  profilePhotoUrl?: string | null;
  profileActive?: boolean;
  onOpenProfile?: () => void;
  showAdminLoginLink?: boolean;
  className?: string;
}

export default function AppScreenHeader({
  profileName = "Profile",
  profilePhotoUrl = null,
  profileActive = false,
  onOpenProfile,
  showAdminLoginLink = true,
  className,
}: AppScreenHeaderProps) {
  const commandPalette = useCommandPalette();

  return (
    <header
      className={cn(
        "mobile-safe-area-y sticky top-0 z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 shadow-sm lg:px-6",
        className
      )}
    >
      <div className="flex items-center gap-3 justify-self-start">
        <CompanyLogo size="md" showFallback />
        <CompanySwitcher />
      </div>
      <GlobalSearchBar />
      <div className="flex items-center justify-end gap-3 justify-self-end">
        {commandPalette ? (
          <button
            type="button"
            onClick={commandPalette.openPalette}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
            aria-label="Open command palette"
          >
            <Search className="h-4 w-4" />
            <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline">
              Ctrl+K
            </kbd>
          </button>
        ) : null}
        {showAdminLoginLink ? (
          <Link
            href="/login"
            className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
          >
            Log In
          </Link>
        ) : null}
        {onOpenProfile ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className={cn(
              "inline-flex items-center rounded-full border p-0.5 transition",
              profileActive
                ? "border-orange-300 bg-orange-50"
                : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50"
            )}
            aria-label={`Open my worker profile (${profileName})`}
          >
            <WorkerProfileAvatar
              photoUrl={profilePhotoUrl}
              displayName={profileName}
              size="sm"
              enableLightbox={false}
            />
          </button>
        ) : null}
      </div>
    </header>
  );
}
