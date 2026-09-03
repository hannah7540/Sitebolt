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
    <div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-50">
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={signingOut}
        className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-900/80 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition-colors hover:bg-slate-900 disabled:opacity-70"
        aria-label="Sign Out"
      >
        <LogOut className="h-4 w-4" />
        <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
      </button>
    </div>
  );
}
