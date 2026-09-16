"use client";

import { useParams } from "next/navigation";
import ItpItcAdminModule from "@/components/itc/admin/ItpItcAdminModule";

export default function AdministrationItcDetailPage() {
  const params = useParams();
  const recordId = String(params.id ?? "");
  return <ItpItcAdminModule initialRecordId={recordId || null} />;
}
