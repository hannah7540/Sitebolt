"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchCompanyProfile } from "@/lib/supabase";
import { resolveCompanyLogoUrl } from "@/lib/company-profile-service";

interface CompanyBrandingContextValue {
  logoUrl: string | null;
  companyName: string;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const CompanyBrandingContext = createContext<CompanyBrandingContextValue>({
  logoUrl: null,
  companyName: "SiteBolt",
  loading: true,
  refreshBranding: async () => {},
});

export function CompanyBrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("SiteBolt");
  const [loading, setLoading] = useState(true);

  const refreshBranding = useCallback(async () => {
    setLoading(true);
    try {
      const profile = await fetchCompanyProfile();
      const resolvedLogo = profile?.logo_url?.trim() || resolveCompanyLogoUrl(profile);
      setLogoUrl(resolvedLogo || null);
      setCompanyName(profile?.company_name?.trim() || "SiteBolt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBranding();
  }, [refreshBranding]);

  const value = useMemo(
    () => ({
      logoUrl,
      companyName,
      loading,
      refreshBranding,
    }),
    [logoUrl, companyName, loading, refreshBranding]
  );

  return (
    <CompanyBrandingContext.Provider value={value}>
      {children}
    </CompanyBrandingContext.Provider>
  );
}

export function useCompanyBranding() {
  return useContext(CompanyBrandingContext);
}
