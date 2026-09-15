"use client";

import { useParams } from "next/navigation";
import FieldItcModule from "@/components/itc/field/FieldItcModule";

export default function AdminItcDetailPage() {
  const params = useParams();
  const itcId = String(params.id ?? "");
  return <FieldItcModule initialItcId={itcId || null} />;
}
