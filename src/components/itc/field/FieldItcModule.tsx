"use client";

import ItpItcAdminModule from "@/components/itc/admin/ItpItcAdminModule";

interface FieldItcModuleProps {
  initialItcId?: string | null;
}

export default function FieldItcModule({ initialItcId = null }: FieldItcModuleProps) {
  return <ItpItcAdminModule initialRecordId={initialItcId} />;
}
