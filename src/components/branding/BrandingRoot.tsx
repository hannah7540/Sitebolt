"use client";

import { CompanyBrandingProvider } from "./CompanyBrandingProvider";

export default function BrandingRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CompanyBrandingProvider>{children}</CompanyBrandingProvider>;
}
