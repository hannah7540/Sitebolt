"use client";

import { HardHat } from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import { getPlantPrestartUnitLabel } from "@/lib/dashboard-form-utils";
import ProjectFormFeedWidget from "./ProjectFormFeedWidget";

interface ProjectPlantPrestartsWidgetProps {
  prestarts: PlantPrestart[];
  plant: PlantAsset[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectPrestart: (prestart: PlantPrestart) => void;
}

function formatPrestartTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectPlantPrestartsWidget({
  prestarts,
  plant,
  loading = false,
  onOpenList,
  onSelectPrestart,
}: ProjectPlantPrestartsWidgetProps) {
  const recent = prestarts.slice(0, 5);

  return (
    <ProjectFormFeedWidget
      icon={HardHat}
      title="Plant Pre-Starts"
      description="Recent equipment pre-starts with pass/defect status."
      countLabel={`${prestarts.length} pre-start${prestarts.length === 1 ? "" : "s"}`}
      loading={loading}
      emptyMessage="No plant pre-starts submitted for this project yet."
      onOpenList={onOpenList}
      onSelectRow={(id) => {
        const prestart = prestarts.find((row) => row.id === id);
        if (prestart) onSelectPrestart(prestart);
      }}
      rows={recent.map((prestart) => ({
        id: prestart.id,
        title: getPlantPrestartUnitLabel(prestart, plant),
        subtitle: `${prestart.operator_name} · ${formatPrestartTimestamp(prestart.created_at)}`,
        badge: prestart.has_defect
          ? { label: "Defect", tone: "danger" as const }
          : { label: "Passed", tone: "success" as const },
      }))}
    />
  );
}
