"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getActiveOrganisationId,
  setActiveOrganisationId,
} from "@/lib/active-organisation";
import { isSuperAdminAccount } from "@/lib/super-admin";
import {
  KNOWN_WORKSPACE_COMPANIES,
  mergeWorkspaceCompanies,
  type WorkspaceCompany,
} from "@/lib/organisation-workspace";
import { MASTER_PROJECT_DASHBOARD_PATH } from "@/lib/user-session";

interface OrganisationWorkspaceContextValue {
  isSuperAdmin: boolean;
  ready: boolean;
  companies: WorkspaceCompany[];
  activeCompany: WorkspaceCompany | null;
  selectCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
}

const OrganisationWorkspaceContext = createContext<OrganisationWorkspaceContextValue | null>(
  null
);

export function useOrganisationWorkspace() {
  return useContext(OrganisationWorkspaceContext);
}

export default function OrganisationWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [companies, setCompanies] = useState<WorkspaceCompany[]>(KNOWN_WORKSPACE_COMPANIES);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const refreshCompanies = useCallback(async () => {
    const response = await fetch("/api/super-admin/companies");
    if (!response.ok) return;
    const payload = (await response.json()) as { companies?: WorkspaceCompany[] };
    setCompanies(mergeWorkspaceCompanies(payload.companies ?? []));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      const superAdmin = isSuperAdminAccount({
        email: user?.email,
        metadata: (user?.user_metadata ?? null) as Record<string, unknown> | null,
      });

      if (cancelled) return;
      setIsSuperAdmin(superAdmin);
      setActiveOrgId(getActiveOrganisationId());

      if (superAdmin) {
        await refreshCompanies();
      }

      if (!cancelled) setReady(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [refreshCompanies]);

  useEffect(() => {
    if (!ready || !isSuperAdmin) return;
    if (pathname === "/select-company") return;
    if (getActiveOrganisationId()) return;
    router.replace("/select-company");
  }, [isSuperAdmin, pathname, ready, router]);

  const selectCompany = useCallback(
    (companyId: string) => {
      setActiveOrganisationId(companyId);
      setActiveOrgId(companyId);
      router.push(MASTER_PROJECT_DASHBOARD_PATH);
    },
    [router]
  );

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeOrgId) ?? null,
    [activeOrgId, companies]
  );

  const value = useMemo(
    () => ({
      isSuperAdmin,
      ready,
      companies,
      activeCompany,
      selectCompany,
      refreshCompanies,
    }),
    [activeCompany, companies, isSuperAdmin, ready, refreshCompanies, selectCompany]
  );

  return (
    <OrganisationWorkspaceContext.Provider value={value}>
      {children}
    </OrganisationWorkspaceContext.Provider>
  );
}
