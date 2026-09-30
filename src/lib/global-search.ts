import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  isSupabaseMissingColumnError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
} from "@/lib/supabase-errors";
import { parseMissingColumnFromError } from "@/lib/form-payload-utils";
import { PROJECT_ITCS_TABLE, PROJECT_ITPS_TABLE } from "@/lib/itp-itc-payload";
import { getAdminItcPath } from "@/lib/console-nav-routes";

export type GlobalSearchGroup =
  | "projects"
  | "workers"
  | "plantFleet"
  | "itpItc";

export interface GlobalSearchHit {
  id: string;
  group: GlobalSearchGroup;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
}

export interface GlobalSearchResults {
  projects: GlobalSearchHit[];
  workers: GlobalSearchHit[];
  plantFleet: GlobalSearchHit[];
  itpItc: GlobalSearchHit[];
}

export const EMPTY_GLOBAL_SEARCH_RESULTS: GlobalSearchResults = {
  projects: [],
  workers: [],
  plantFleet: [],
  itpItc: [],
};

const SEARCH_LIMIT = 15;

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function escapeIlike(raw: string): string {
  return raw
    .replace(/[%_,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function textColumns(columns: string[]): string[] {
  return columns.filter(
    (column) =>
      column !== "id" &&
      column !== "project_id" &&
      column !== "plant_id"
  );
}

function rowMatchesQuery(row: Record<string, unknown>, query: string): boolean {
  const needle = query.toLowerCase();
  return Object.values(row).some((value) =>
    String(value ?? "")
      .toLowerCase()
      .includes(needle)
  );
}

async function safeSearchTable(
  table: string,
  selectVariants: string[][]
): Promise<Record<string, unknown>[]> {
  if (!isSupabaseConfigured()) return [];

  let lastMissing: string | null = null;

  for (const columns of selectVariants) {
    const available: string[] = lastMissing
      ? columns.filter((column) => column !== lastMissing)
      : columns;
    if (available.length === 0 || !available.includes("id")) continue;

    const select = available.join(",");
    try {
      const { data, error } = await supabase.from(table).select(select).limit(80);
      if (!error) {
        return (data ?? []).map((row) => asRecord(row));
      }

      const requestError = toSupabaseRequestError(error);
      if (isSupabaseTableUnavailableError(requestError, table)) {
        return [];
      }

      if (isSupabaseMissingColumnError(requestError)) {
        lastMissing =
          parseMissingColumnFromError(error.message) ?? lastMissing;
        continue;
      }

      console.warn(`[global-search] ${table} select failed:`, error.message);
      return [];
    } catch (error) {
      console.warn(`[global-search] ${table} select failed:`, error);
      return [];
    }
  }

  return [];
}

function filterRows(
  rows: Record<string, unknown>[],
  query: string
): Record<string, unknown>[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  return rows.filter((row) => rowMatchesQuery(row, needle)).slice(0, SEARCH_LIMIT);
}

async function searchWithIlike(
  table: string,
  columns: string[],
  query: string
): Promise<Record<string, unknown>[] | null> {
  if (!isSupabaseConfigured()) return [];
  const escaped = escapeIlike(query);
  if (!escaped) return [];

  const filters = textColumns(columns)
    .map((column) => `${column}.ilike.%${escaped}%`)
    .join(",");
  if (!filters) return null;

  try {
    const { data, error } = await supabase
      .from(table)
      .select(columns.join(","))
      .or(filters)
      .limit(SEARCH_LIMIT);

    if (!error) {
      return (data ?? []).map((row) => asRecord(row));
    }

    const requestError = toSupabaseRequestError(error);
    if (isSupabaseTableUnavailableError(requestError, table)) {
      return [];
    }
    return null;
  } catch {
    return null;
  }
}

async function searchEntity(
  table: string,
  selectVariants: string[][],
  query: string
): Promise<Record<string, unknown>[]> {
  const preferred = selectVariants[0];
  if (preferred) {
    const hit = await searchWithIlike(table, preferred, query);
    if (hit) return hit;
  }

  const rows = await safeSearchTable(table, selectVariants);
  return filterRows(rows, query);
}

function mapHits(
  rows: Record<string, unknown>[],
  mapper: (row: Record<string, unknown>) => GlobalSearchHit | null
): GlobalSearchHit[] {
  const hits: GlobalSearchHit[] = [];
  for (const row of rows) {
    const hit = mapper(row);
    if (hit) hits.push(hit);
  }
  return hits;
}

export function countGlobalSearchHits(results: GlobalSearchResults): number {
  return (
    results.projects.length +
    results.workers.length +
    results.plantFleet.length +
    results.itpItc.length
  );
}

export async function runGlobalSearch(rawQuery: string): Promise<GlobalSearchResults> {
  const query = rawQuery.trim();
  if (!query || !isSupabaseConfigured()) {
    return EMPTY_GLOBAL_SEARCH_RESULTS;
  }

  const [projectRows, workerRows, plantRows, fleetRows, itpRows, itcRows] =
    await Promise.all([
      searchEntity(
        "projects",
        [
          ["id", "name", "status"],
          ["id", "project_name", "status"],
          ["id", "name"],
          ["id", "project_name"],
          ["id"],
        ],
        query
      ),
      searchEntity(
        "workers",
        [
          ["id", "first_name", "last_name", "email"],
          ["id", "name", "email"],
          ["id", "full_name", "email"],
          ["id", "first_name", "last_name"],
          ["id", "email"],
          ["id"],
        ],
        query
      ),
      searchEntity(
        "plant",
        [
          ["id", "plant_id", "name", "make", "model", "rego_number", "status"],
          ["id", "plant_id", "name", "make", "model", "registration_code", "status"],
          ["id", "name", "make", "model", "unit_number", "status"],
          ["id", "name", "make", "model", "status"],
          ["id", "name"],
          ["id"],
        ],
        query
      ),
      searchEntity(
        "organization_fleet",
        [
          ["id", "vehicle_name", "rego_number", "make", "model"],
          ["id", "unit_number", "registration", "make", "model"],
          ["id", "unit_number", "make", "model"],
          ["id", "make", "model"],
          ["id"],
        ],
        query
      ),
      searchEntity(
        PROJECT_ITPS_TABLE,
        [
          ["id", "itp_number", "service", "service_type", "project_id"],
          ["id", "itp_number", "trade_category", "project_id"],
          ["id", "itp_number", "title", "project_id"],
          ["id", "itp_number", "project_id"],
          ["id"],
        ],
        query
      ),
      searchEntity(
        PROJECT_ITCS_TABLE,
        [
          ["id", "activity_number", "service", "service_type", "project_id"],
          ["id", "itc_number", "service", "service_type", "project_id"],
          ["id", "itc_number", "service_discipline", "project_id"],
          ["id", "itc_number", "project_id"],
          ["id"],
        ],
        query
      ),
    ]);

  return {
    projects: mapHits(projectRows, (row) => {
      const id = str(row, "id");
      if (!id) return null;
      return {
        id,
        group: "projects",
        title: str(row, "name", "project_name") || "Untitled project",
        subtitle: str(row, "status") || "Project",
        badge: str(row, "status") || "Project",
        href: `/projects/${id}`,
      };
    }),
    workers: mapHits(workerRows, (row) => {
      const id = str(row, "id");
      if (!id) return null;
      const fullName =
        [str(row, "first_name"), str(row, "last_name")].filter(Boolean).join(" ") ||
        str(row, "name", "full_name", "email") ||
        "Worker";
      return {
        id,
        group: "workers",
        title: fullName,
        subtitle: str(row, "email"),
        badge: "Worker",
        href: `/organisation/workers?id=${encodeURIComponent(id)}&action=view`,
      };
    }),
    plantFleet: [
      ...mapHits(plantRows, (row) => {
        const id = str(row, "id");
        if (!id) return null;
        const identity = str(row, "rego_number", "registration_code", "plant_id", "id");
        return {
          id: `plant-${id}`,
          group: "plantFleet",
          title: str(row, "name", "plant_id") || "Plant asset",
          subtitle: [str(row, "make"), str(row, "model"), identity]
            .filter(Boolean)
            .join(" · "),
          badge: str(row, "status") || "Plant",
          href: `/organisation/plant?id=${encodeURIComponent(id)}&action=view`,
        };
      }),
      ...mapHits(fleetRows, (row) => {
        const id = str(row, "id");
        if (!id) return null;
        const identity = str(row, "rego_number", "registration", "vehicle_name", "unit_number");
        return {
          id: `fleet-${id}`,
          group: "plantFleet",
          title: str(row, "vehicle_name", "unit_number") || "Fleet vehicle",
          subtitle: [str(row, "make"), str(row, "model"), identity]
            .filter(Boolean)
            .join(" · "),
          badge: "Fleet",
          href: `/organisation/fleet?id=${encodeURIComponent(id)}&action=view`,
        };
      }),
    ].slice(0, SEARCH_LIMIT),
    itpItc: [
      ...mapHits(itpRows, (row) => {
        const id = str(row, "id");
        if (!id) return null;
        const projectId = str(row, "project_id");
        return {
          id: `itp-${id}`,
          group: "itpItc",
          title: str(row, "itp_number") || "ITP",
          subtitle: str(row, "service", "service_type", "trade_category", "title"),
          badge: "ITP",
          href: projectId ? `/projects/${projectId}` : "/admin/itc",
        };
      }),
      ...mapHits(itcRows, (row) => {
        const id = str(row, "id");
        if (!id) return null;
        return {
          id: `itc-${id}`,
          group: "itpItc",
          title: str(row, "activity_number", "itc_number") || "ITC",
          subtitle: str(row, "service", "service_type", "service_discipline"),
          badge: "ITC",
          href: getAdminItcPath(id),
        };
      }),
    ].slice(0, SEARCH_LIMIT),
  };
}
