"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOutAndRedirect } from "@/lib/auth-guard";

export default function WorkerDashboardSignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOutAndRedirect();
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <div className="mt-12 mb-8 flex justify-center px-4 sm:justify-end">
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:opacity-70"
        aria-label="Sign Out"
      >
        <LogOut className="h-4 w-4 text-slate-500" />
        <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
      </button>
    </div>
  );
}
