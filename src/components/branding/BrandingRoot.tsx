"use client";

import { CompanyBrandingProvider } from "./CompanyBrandingProvider";
import NativeAppRouteGuard from "@/components/layout/NativeAppRouteGuard";
import NativeBackButtonHandler from "@/components/layout/NativeBackButtonHandler";
import WorkerPushNotifications from "@/components/workers/WorkerPushNotifications";

export default function BrandingRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CompanyBrandingProvider>
      <NativeAppRouteGuard />
      <NativeBackButtonHandler />
      <WorkerPushNotifications />
      {children}
    </CompanyBrandingProvider>
  );
}
