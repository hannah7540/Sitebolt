"use client";

import { CompanyBrandingProvider } from "./CompanyBrandingProvider";
import HashAuthCapture from "@/components/auth/HashAuthCapture";
import NativeAppRouteGuard from "@/components/layout/NativeAppRouteGuard";
import NativeBackButtonHandler from "@/components/layout/NativeBackButtonHandler";
import WorkerPushNotifications from "@/components/workers/WorkerPushNotifications";
import CommandPaletteProvider from "@/components/command-palette/CommandPaletteProvider";
import GlobalSearchProvider from "@/components/search/GlobalSearchProvider";
import OrganisationWorkspaceProvider from "@/components/organisation/OrganisationWorkspaceProvider";

export default function BrandingRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <OrganisationWorkspaceProvider>
      <CompanyBrandingProvider>
        <CommandPaletteProvider>
          <GlobalSearchProvider>
            <HashAuthCapture />
            <NativeAppRouteGuard />
            <NativeBackButtonHandler />
            <WorkerPushNotifications />
            {children}
          </GlobalSearchProvider>
        </CommandPaletteProvider>
      </CompanyBrandingProvider>
    </OrganisationWorkspaceProvider>
  );
}
