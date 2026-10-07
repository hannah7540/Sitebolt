import { Suspense } from "react";
import type { Metadata } from "next";
import MarketingLandingPage from "@/components/marketing/MarketingLandingPage";

export const metadata: Metadata = {
  title: "SiteBolt — Civil & Construction Field Operations",
  description:
    "Purpose-built for Australian and NZ civil contractors. Plant QR verification, 31-day SWMS sign-offs, ITP drawings, and audit-ready Fair Work timesheets.",
};

export default function MarketingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <MarketingLandingPage />
    </Suspense>
  );
}
