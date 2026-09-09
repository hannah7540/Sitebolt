"use client";

import { useParams } from "next/navigation";
import PlantPrestartPageClient from "@/components/prestart/PlantPrestartPageClient";

export default function LegacyHyphenPrestartPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  return <PlantPrestartPageClient plantId={id} />;
}
