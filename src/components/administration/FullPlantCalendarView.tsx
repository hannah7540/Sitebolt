"use client";

import { useEffect, useMemo, useState } from "react";
import PlantFleetScheduler from "@/components/plant/PlantFleetScheduler";
import ProjectMultiSelect from "@/components/administration/ProjectMultiSelect";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Full Plant <span className="text-orange-500">Calendar</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Consolidated plant assignments, service schedules, and defect alerts
          across all active projects.
        </p>
      </div>

      <ProjectMultiSelect
        projects={projects}
        selectedProjectIds={selectedProjectIds}
        onChange={setSelectedProjectIds}
      />

      <PlantFleetScheduler
        plant={plant}
        loading={loading}
        onRefresh={onRefresh}
        filterProjectIds={effectiveFilter}
        title="Full Plant Calendar"
        subtitle="Fleet allocation and service scheduling across selected projects — project badges Mon–Fri; weekend events when logged"
        showHeaderAlerts
      />
    </div>
  );
}
