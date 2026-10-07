import { Suspense } from "react";
import type { Metadata } from "next";
import MarketingLandingPage from "@/components/marketing/MarketingLandingPage";

export const metadata: Metadata = {
  title: "SiteBolt — Field Operations Software for Every Industry",
  description:
    "Operational software for field teams across construction, logistics, facilities, manufacturing, and specialist trades. Plant QR, compliance, timesheets, and custom workflows.",
};

export default function MarketingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#13171B]" />}>
      <MarketingLandingPage />
    </Suspense>
  );
}
