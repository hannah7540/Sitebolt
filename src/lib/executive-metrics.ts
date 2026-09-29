import {
  fetchPlant,
  fetchPlantPrestarts,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase";
import { fetchOrganizationFleet } from "@/lib/organization-fleet";
import {
  fetchProjects,
  filterActiveProjects,
  getCachedProjects,
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

export async function fetchExecutiveMetrics(): Promise<ExecutiveMetrics> {
  if (!isSupabaseConfigured()) return EMPTY_METRICS;

  const today = localIsoDate();

  const [plant, fleet, todaysPrestarts, pendingItpItems, pendingItcSignoffs, openNcrs] =
    await Promise.all([
      fetchPlant().catch(() => []),
      fetchOrganizationFleet().catch(() => []),
      fetchPlantPrestarts({ startDate: today, endDate: today, limit: 2000 }).catch(
        () => []
      ),
      countRows(PROJECT_ITP_ITEMS_TABLE, "status", ["pending", "non_conforming"]),
      countRows(ITC_SIGNOFFS_TABLE, "status", ["draft"]),
      countRows("ncrs", "status", ["open"]),
    ]);

  try {
    await fetchProjects();
  } catch {
    // Cached/empty project list is fine for a dashboard strip.
  }

  const activeProjects = filterActiveProjects(getCachedProjects()).length;

  const activePlant = (plant ?? []).filter(
    (row) => !isPlantArchived(row) && !isTaggedOut(row)
  );
  const activeFleet = (fleet ?? []).filter((row) => {
    const status = String(row.status ?? "").toLowerCase();
    return !isFleetArchived(row) && status !== "out of service";
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
