import type { Metadata } from "next";
import GuestSwmsPortal from "@/components/swms/GuestSwmsPortal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Guest SWMS Portal — SiteBolt",
  description: "Review and sign a SWMS sent to you as a guest.",
};

export default function GuestSwmsPage() {
  return <GuestSwmsPortal />;
}
