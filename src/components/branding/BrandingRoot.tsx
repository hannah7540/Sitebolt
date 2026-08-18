"use client";

import { CompanyBrandingProvider } from "./CompanyBrandingProvider";
import NativeAppRouteGuard from "@/components/layout/NativeAppRouteGuard";

export default function BrandingRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CompanyBrandingProvider>
      <NativeAppRouteGuard />
      {children}
    </CompanyBrandingProvider>
  );
}
