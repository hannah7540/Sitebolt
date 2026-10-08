"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveOrganisationId } from "@/lib/active-organisation";
import { activateOrganisationWorkspace } from "@/lib/activate-organisation";
import { isSuperAdminAccount } from "@/lib/super-admin";
import {
  KNOWN_WORKSPACE_COMPANIES,
  mergeWorkspaceCompanies,
  type WorkspaceCompany,
} from "@/lib/organisation-workspace";
import {
  ALL_ENABLED_FEATURE_FLAGS,
  parseOrganisationFeatureFlags,
  type OrganisationFeatureFlags,
} from "@/lib/organisation-feature-flags";

interface OrganisationWorkspaceContextValue {
  isSuperAdmin: boolean;
  ready: boolean;
  companies: WorkspaceCompany[];
  activeCompany: WorkspaceCompany | null;
  featureFlags: OrganisationFeatureFlags;
  selectCompany: (companyId: string) => Promise<void>;
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
  const [featureFlags, setFeatureFlags] = useState<OrganisationFeatureFlags>(
    ALL_ENABLED_FEATURE_FLAGS
  );

  const refreshCompanies = useCallback(async () => {
    const response = await fetch("/api/super-admin/companies");
    if (!response.ok) return;
    const payload = (await response.json()) as { companies?: WorkspaceCompany[] };
    setCompanies(mergeWorkspaceCompanies(payload.companies ?? []));
  }, []);

  const refreshFeatureFlags = useCallback(async (organisationId?: string | null) => {
    try {
      const response = await fetch("/api/organisation/feature-flags");
      if (!response.ok) return;
      const payload = (await response.json()) as {
        organisation_id?: string | null;
        feature_flags?: unknown;
      };
      setFeatureFlags(
        parseOrganisationFeatureFlags(
          payload.feature_flags,
          organisationId ?? payload.organisation_id
        )
      );
    } catch {
      setFeatureFlags(ALL_ENABLED_FEATURE_FLAGS);
    }
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
      await refreshFeatureFlags(getActiveOrganisationId());

      if (!cancelled) setReady(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [refreshCompanies, refreshFeatureFlags]);

  useEffect(() => {
    if (!ready || !isSuperAdmin) return;
    if (pathname === "/select-company") return;
    if (getActiveOrganisationId()) return;
    router.replace("/select-company");
  }, [isSuperAdmin, pathname, ready, router]);

  const selectCompany = useCallback(async (companyId: string) => {
    setActiveOrgId(companyId);
    await activateOrganisationWorkspace(companyId);
  }, []);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeOrgId) ?? null,
    [activeOrgId, companies]
  );

  const resolvedFlags = useMemo(
    () =>
      parseOrganisationFeatureFlags(
        activeCompany?.feature_flags ?? featureFlags,
        activeCompany?.id ?? activeOrgId
      ),
    [activeCompany, activeOrgId, featureFlags]
  );

  const value = useMemo(
    () => ({
      isSuperAdmin,
      ready,
      companies,
      activeCompany,
      featureFlags: resolvedFlags,
      selectCompany,
      refreshCompanies,
    }),
    [
      activeCompany,
      companies,
      isSuperAdmin,
      ready,
      refreshCompanies,
      resolvedFlags,
      selectCompany,
    ]
  );

  return (
    <OrganisationWorkspaceContext.Provider value={value}>
      {children}
    </OrganisationWorkspaceContext.Provider>
  );
}
