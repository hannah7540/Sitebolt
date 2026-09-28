"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Loader2 } from "lucide-react";
import {
  prestartLoginHref,
  resolvePrestartOperatorIdentity,
  type PrestartOperatorIdentity,
} from "@/lib/prestart-operator";

type ResolvedIdentity = Omit<PrestartOperatorIdentity, "loading">;

const PrestartIdentityContext = createContext<ResolvedIdentity | null>(null);

export function usePrestartIdentity(): ResolvedIdentity {
  const identity = useContext(PrestartIdentityContext);
  if (!identity) {
    throw new Error("usePrestartIdentity must be used inside PrestartAuthGate.");
  }
  return identity;
}

export function PrestartWorkerIdentityBadge({ name }: { name: string }) {
  return (
    <div className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">Operator</span>
      <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
        <BadgeCheck className="h-4 w-4 shrink-0" />
        <span className="truncate">{name || "Authenticated worker"}</span>
      </div>
    </div>
  );
}

export default function PrestartAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<ResolvedIdentity | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolvePrestartOperatorIdentity().then((result) => {
      if (cancelled) return;
      if (!result.hasSession) {
        router.replace(prestartLoginHref());
        return;
      }
      setIdentity(result);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!identity) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <PrestartIdentityContext.Provider value={identity}>
      {children}
    </PrestartIdentityContext.Provider>
  );
}
