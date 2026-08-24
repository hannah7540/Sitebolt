"use client";

import { useEffect, useMemo, useState } from "react";
import PlantFleetScheduler from "@/components/plant/PlantFleetScheduler";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
import CalendarExpandShell from "@/components/administration/CalendarExpandShell";
import type { PlantAsset } from "@/lib/supabase";
import {
  buildPlantServiceCreateInput,
  createPlantServiceSchedule,
  resolvePlantServiceDisplayName,
  updatePlantServiceSchedule,
  type CreatePlantServiceScheduleInput,
  type UpdatePlantServiceScheduleInput,
} from "@/lib/plant-services";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";

export {
  buildPlantServiceCreateInput,
  createPlantServiceSchedule,
  resolvePlantServiceDisplayName,
  updatePlantServiceSchedule,
  type CreatePlantServiceScheduleInput,
  type UpdatePlantServiceScheduleInput,
};

export interface FullPlantCalendarViewProps {
  plant: PlantAsset[];
  loading: boolean;
  onRefresh: () => void;
}

export default function FullPlantCalendarView({
  plant,
  loading,
  onRefresh,
}: FullPlantCalendarViewProps) {
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchProjects().then((list) => {
      setProjects(list);
      setSelectedProjectIds(list.map((project) => project.id));
    });
  }, []);

  const effectiveFilter = useMemo(() => {
    if (selectedProjectIds.length === 0) return [];
    if (selectedProjectIds.length === projects.length) return [];
    return selectedProjectIds;
  }, [selectedProjectIds, projects.length]);

  return (
    <CalendarExpandShell
      expanded={expanded}
      onExpandedChange={setExpanded}
      title={
        <h1 className="text-3xl font-bold text-slate-900">
          Full Plant <span className="text-orange-500">Calendar</span>
        </h1>
      }
      subtitle="Consolidated plant assignments, service schedules, and defect alerts across all active projects."
      filters={
        <ProjectMultiSelect
          projects={projects}
          selectedProjectIds={selectedProjectIds}
          onChange={setSelectedProjectIds}
        />
      }
    >
      <PlantFleetScheduler
        plant={plant}
        loading={loading}
        onRefresh={onRefresh}
        filterProjectIds={effectiveFilter}
        title="Full Plant Calendar"
        subtitle="Fleet allocation and service scheduling across selected projects — project badges Mon–Fri; weekend events when logged"
        showHeaderAlerts
        hideTitle
        scrollMaxHeightClass={
          expanded ? "max-h-[calc(92vh-14rem)]" : undefined
        }
      />
    </CalendarExpandShell>
  );
}
