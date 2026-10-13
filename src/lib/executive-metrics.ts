import {
  fetchPlant,
  fetchPlantPrestarts,
  isSupabaseConfigured,
  resolvePlantAssignedProjectId,
  supabase,
  type Worker,
} from "@/lib/supabase";
import { fetchOrganizationFleet } from "@/lib/organization-fleet";
import {
  fetchProjects,
  filterActiveProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { isPlantArchived } from "@/lib/plant-archive";
import { isFleetArchived } from "@/lib/fleet-archive";
import { isTaggedOut } from "@/lib/plant-utils";
import { localIsoDate } from "@/lib/timesheet-utils";
import { isSupabaseTableUnavailableError } from "@/lib/supabase-errors";
import {
  ITC_SIGNOFFS_TABLE,
  PROJECT_ITP_ITEMS_TABLE,
} from "@/lib/itp-itc-payload";
import {
  buildDashboardFilterContext,
  matchesDashboardFilters,
  type DashboardFilterWorker,
} from "@/lib/master-project-dashboard";

export interface ExecutiveMetrics {
  activeProjects: number;
  equipmentTotal: number;
  equipmentCurrent: number;
  equipmentOverdue: number;
  actionRequired: number;
}

const EMPTY_METRICS: ExecutiveMetrics = {
  activeProjects: 0,
  equipmentTotal: 0,
  equipmentCurrent: 0,
  equipmentOverdue: 0,
  actionRequired: 0,
};

async function countRows(
  table: string,
  column: string,
  values: string[]
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  try {
    const query = supabase.from(table).select("id", { count: "exact", head: true });
    const { count, error } =
      values.length === 1
        ? await query.eq(column, values[0])
        : await query.in(column, values);
    if (error) {
      if (isSupabaseTableUnavailableError(error, table)) return 0;
      console.warn(`[executive-metrics] ${table} count failed:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    console.warn(`[executive-metrics] ${table} count failed:`, error);
    return 0;
  }
}

export interface ExecutiveMetricsFilters {
  projectIds?: string[];
  state?: string | null;
  projects?: DbProject[];
  workers?: Array<DashboardFilterWorker | Worker>;
}

async function countFilteredActionRows(
  table: string,
  column: string,
  values: string[],
  ctx: ReturnType<typeof buildDashboardFilterContext>
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const hasFilters = ctx.filterProjectIds.length > 0 || Boolean(ctx.filterState);
  if (!hasFilters) {
    return countRows(table, column, values);
  }

  try {
    const fullQuery = supabase
      .from(table)
      .select("id, project_id, signed_by_worker_id, worker_id");
    const { data, error } = await (values.length === 1
      ? fullQuery.eq(column, values[0])
      : fullQuery.in(column, values));
    if (!error) {
      return (data ?? []).filter((row) => {
        const record = row as {
          project_id?: string | null;
          signed_by_worker_id?: string | null;
          worker_id?: string | null;
        };
        return matchesDashboardFilters(
          {
            projectId: record.project_id,
            workerId: record.signed_by_worker_id || record.worker_id,
          },
          ctx
        );
      }).length;
    }
    if (isSupabaseTableUnavailableError(error, table)) return 0;
    const minQuery = supabase.from(table).select("id, project_id");
    const retry = await (values.length === 1
      ? minQuery.eq(column, values[0])
      : minQuery.in(column, values));
    if (retry.error) {
      if (isSupabaseTableUnavailableError(retry.error, table)) return 0;
      console.warn(`[executive-metrics] ${table} count failed:`, retry.error.message);
      return 0;
    }
    return (retry.data ?? []).filter((row) =>
      matchesDashboardFilters(
        { projectId: (row as { project_id?: string | null }).project_id },
        ctx
      )
    ).length;
  } catch (error) {
    console.warn(`[executive-metrics] ${table} count failed:`, error);
    return 0;
  }
}

export async function fetchExecutiveMetrics(
  filters: ExecutiveMetricsFilters = {}
): Promise<ExecutiveMetrics> {
  if (!isSupabaseConfigured()) return EMPTY_METRICS;

  const today = localIsoDate();

  try {
    await fetchProjects();
  } catch {
    // Cached/empty project list is fine for a dashboard strip.
  }

  const projects = filters.projects ?? filterActiveProjects(getCachedProjects());
  const ctx = buildDashboardFilterContext(
    projects,
    filters.workers,
    filters.projectIds,
    filters.state
  );

  const [plant, fleet, todaysPrestarts, pendingItpItems, pendingItcSignoffs, openNcrs] =
    await Promise.all([
      fetchPlant().catch(() => []),
      fetchOrganizationFleet().catch(() => []),
      fetchPlantPrestarts({ startDate: today, endDate: today, limit: 2000 }).catch(
        () => []
      ),
      countFilteredActionRows(
        PROJECT_ITP_ITEMS_TABLE,
        "status",
        ["pending", "non_conforming"],
        ctx
      ),
      countFilteredActionRows(ITC_SIGNOFFS_TABLE, "status", ["draft"], ctx),
      countFilteredActionRows("ncrs", "status", ["open"], ctx),
    ]);

  const activeProjects = filterActiveProjects(projects).filter((project) =>
    matchesDashboardFilters({ projectId: project.id }, ctx)
  ).length;

  const activePlant = (plant ?? []).filter((row) => {
    if (isPlantArchived(row) || isTaggedOut(row)) return false;
    return matchesDashboardFilters(
      {
        projectId: resolvePlantAssignedProjectId(row) || row.project_id,
        workerId: row.assigned_worker_id,
      },
      ctx
    );
  });
  const activeFleet = (fleet ?? []).filter((row) => {
    const status = String(row.status ?? "").toLowerCase();
    if (isFleetArchived(row) || status === "out of service") return false;
    return matchesDashboardFilters(
      {
        projectId: row.assigned_project_id,
        workerId: row.assigned_worker_id,
        assignedState: row.state,
      },
      ctx
    );
  });

  const plantDone = new Set<string>();
  const fleetDone = new Set<string>();
  for (const row of todaysPrestarts ?? []) {
    const plantId = String(row.plant_id ?? "").trim();
    const fleetId = String(row.fleet_id ?? "").trim();
    if (plantId) plantDone.add(plantId);
    if (fleetId) fleetDone.add(fleetId);
  }

  const equipmentCurrent =
    activePlant.filter((row) => plantDone.has(row.id)).length +
    activeFleet.filter((row) => fleetDone.has(row.id)).length;
  const equipmentTotal = activePlant.length + activeFleet.length;
  const equipmentOverdue = Math.max(0, equipmentTotal - equipmentCurrent);

  return {
    activeProjects,
    equipmentTotal,
    equipmentCurrent,
    equipmentOverdue,
    actionRequired: pendingItpItems + pendingItcSignoffs + openNcrs,
  };
}
