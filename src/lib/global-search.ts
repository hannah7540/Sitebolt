import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
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

function normalizeTerm(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function tokenize(term: string): string[] {
  return normalizeTerm(term)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6);
}

function escapeIlike(raw: string): string {
  return raw.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function rowHaystack(row: Record<string, unknown>): string {
  return Object.values(row)
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function rowMatchesTokens(row: Record<string, unknown>, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const haystack = rowHaystack(row);
  const full = tokens.join(" ");
  if (haystack.includes(full)) return true;
  return tokens.every((token) => haystack.includes(token));
}

function isTableGone(
  error: ReturnType<typeof toSupabaseRequestError>,
  table: string
): boolean {
  if (!error) return false;
  if (isSupabaseMissingColumnError(error)) return false;
  return (
    isSupabaseRelationMissingError(error) ||
    isSupabaseTableUnavailableError(error, table)
  );
}

function buildIlikeOrFilter(columns: string[], terms: string[]): string {
  return terms
    .flatMap((term) =>
      columns.map((column) => `${column}.ilike.%${escapeIlike(term)}%`)
    )
    .join(",");
}

async function queryIlikeOr(input: {
  table: string;
  selectColumns: string[];
  searchColumns: string[];
  terms: string[];
}): Promise<{
  rows: Record<string, unknown>[];
  errorColumn: string | null;
  gone: boolean;
  ok: boolean;
}> {
  const selectColumns = uniqueStrings(input.selectColumns);
  const searchColumns = uniqueStrings(input.searchColumns);
  const terms = input.terms.map(escapeIlike).filter(Boolean);
  if (selectColumns.length === 0 || searchColumns.length === 0 || terms.length === 0) {
    return { rows: [], errorColumn: null, gone: false, ok: false };
  }

  const filter = buildIlikeOrFilter(searchColumns, terms);
  if (!filter) return { rows: [], errorColumn: null, gone: false, ok: false };

  try {
    const { data, error } = await supabase
      .from(input.table)
      .select(selectColumns.join(","))
      .or(filter)
      .limit(80);

    if (!error) {
      return {
        rows: (data ?? []).map((row) => asRecord(row)),
        errorColumn: null,
        gone: false,
        ok: true,
      };
    }

    const requestError = toSupabaseRequestError(error);
    if (isTableGone(requestError, input.table)) {
      return { rows: [], errorColumn: null, gone: true, ok: false };
    }

    if (isSupabaseMissingColumnError(requestError)) {
      return {
        rows: [],
        errorColumn: parseMissingColumnFromError(error.message),
        gone: false,
        ok: false,
      };
    }

    console.warn(`[global-search] ${input.table} ilike failed:`, error.message);
    return { rows: [], errorColumn: null, gone: false, ok: false };
  } catch (error) {
    console.warn(`[global-search] ${input.table} ilike failed:`, error);
    return { rows: [], errorColumn: null, gone: false, ok: false };
  }
}

async function queryColumnIlike(input: {
  table: string;
  selectColumns: string[];
  column: string;
  term: string;
}): Promise<Record<string, unknown>[]> {
  const escaped = escapeIlike(input.term);
  if (!escaped) return [];
  try {
    const { data, error } = await supabase
      .from(input.table)
      .select(uniqueStrings(input.selectColumns).join(","))
      .ilike(input.column, `%${escaped}%`)
      .limit(SEARCH_LIMIT);

    if (error) {
      const requestError = toSupabaseRequestError(error);
      if (
        !isSupabaseMissingColumnError(requestError) &&
        !isTableGone(requestError, input.table)
      ) {
        console.warn(`[global-search] ${input.table}.${input.column} ilike failed:`, error.message);
      }
      return [];
    }
    return (data ?? []).map((row) => asRecord(row));
  } catch (error) {
    console.warn(`[global-search] ${input.table}.${input.column} ilike failed:`, error);
    return [];
  }
}

async function querySelectOnly(
  table: string,
  selectColumns: string[]
): Promise<{ rows: Record<string, unknown>[]; errorColumn: string | null; gone: boolean }> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select(uniqueStrings(selectColumns).join(","))
      .limit(200);

    if (!error) {
      return { rows: (data ?? []).map((row) => asRecord(row)), errorColumn: null, gone: false };
    }

    const requestError = toSupabaseRequestError(error);
    if (isTableGone(requestError, table)) {
      return { rows: [], errorColumn: null, gone: true };
    }
    if (isSupabaseMissingColumnError(requestError)) {
      return {
        rows: [],
        errorColumn: parseMissingColumnFromError(error.message),
        gone: false,
      };
    }
    return { rows: [], errorColumn: null, gone: false };
  } catch {
    return { rows: [], errorColumn: null, gone: false };
  }
}

function dropColumn(columns: string[], missing: string | null): string[] {
  if (!missing) return columns;
  return columns.filter((column) => column !== missing);
}

async function searchEntity(input: {
  table: string;
  selectColumns: string[];
  searchColumns: string[];
  term: string;
}): Promise<Record<string, unknown>[]> {
  if (!isSupabaseConfigured()) return [];

  const tokens = tokenize(input.term);
  if (tokens.length === 0) return [];

  let selectColumns = uniqueStrings(["id", ...input.selectColumns]);
  let searchColumns = uniqueStrings(input.searchColumns);
  const terms = tokens;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await queryIlikeOr({
      table: input.table,
      selectColumns,
      searchColumns,
      terms,
    });
    if (result.gone) return [];
    if (result.ok) {
      return result.rows
        .filter((row) => rowMatchesTokens(row, tokens))
        .slice(0, SEARCH_LIMIT);
    }
    selectColumns = dropColumn(selectColumns, result.errorColumn);
    searchColumns = dropColumn(searchColumns, result.errorColumn);
    if (selectColumns.length === 0 || !selectColumns.includes("id") || searchColumns.length === 0) {
      break;
    }
  }

  const perColumnHits: Record<string, unknown>[] = [];
  for (const column of searchColumns) {
    for (const token of terms) {
      const rows = await queryColumnIlike({
        table: input.table,
        selectColumns,
        column,
        term: token,
      });
      perColumnHits.push(...rows);
    }
  }
  if (perColumnHits.length > 0) {
    const byId = new Map<string, Record<string, unknown>>();
    for (const row of perColumnHits) {
      const id = str(row, "id");
      if (id) byId.set(id, row);
    }
    return [...byId.values()]
      .filter((row) => rowMatchesTokens(row, tokens))
      .slice(0, SEARCH_LIMIT);
  }

  let fallbackSelect = selectColumns;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const fallback = await querySelectOnly(input.table, fallbackSelect);
    if (fallback.gone) return [];
    if (!fallback.errorColumn) {
      return fallback.rows
        .filter((row) => rowMatchesTokens(row, tokens))
        .slice(0, SEARCH_LIMIT);
    }
    fallbackSelect = dropColumn(fallbackSelect, fallback.errorColumn);
    if (fallbackSelect.length === 0 || !fallbackSelect.includes("id")) break;
  }

  return [];
}

async function searchWorkers(term: string): Promise<Record<string, unknown>[]> {
  const tokens = tokenize(term);
  const rows = await searchEntity({
    table: "workers",
    selectColumns: ["id", "first_name", "last_name", "email", "name", "full_name"],
    searchColumns: ["first_name", "last_name", "email", "name", "full_name"],
    term,
  });

  if (tokens.length < 2) return rows;

  const first = tokens[0] ?? "";
  const last = tokens[tokens.length - 1] ?? "";
  const selectColumns = ["id", "first_name", "last_name", "email", "name", "full_name"];

  try {
    const { data, error } = await supabase
      .from("workers")
      .select(selectColumns.join(","))
      .ilike("first_name", `%${escapeIlike(first)}%`)
      .ilike("last_name", `%${escapeIlike(last)}%`)
      .limit(SEARCH_LIMIT);

    if (!error && data) {
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of [...rows, ...data.map((item) => asRecord(item))]) {
        const id = str(row, "id");
        if (id) byId.set(id, row);
      }
      return [...byId.values()]
        .filter((row) => rowMatchesTokens(row, tokens))
        .slice(0, SEARCH_LIMIT);
    }

    if (error && isSupabaseMissingColumnError(toSupabaseRequestError(error))) {
      const orRows = await queryIlikeOr({
        table: "workers",
        selectColumns,
        searchColumns: ["first_name", "last_name", "email", "name"],
        terms: tokens,
      });
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of [...rows, ...orRows.rows]) {
        const id = str(row, "id");
        if (id) byId.set(id, row);
      }
      return [...byId.values()]
        .filter((row) => rowMatchesTokens(row, tokens))
        .slice(0, SEARCH_LIMIT);
    }
  } catch (error) {
    console.warn("[global-search] workers split-name query failed:", error);
  }

  return rows;
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
  const term = normalizeTerm(rawQuery);
  if (!term || !isSupabaseConfigured()) {
    return EMPTY_GLOBAL_SEARCH_RESULTS;
  }

  const settled = await Promise.allSettled([
    searchEntity({
      table: "projects",
      selectColumns: [
        "id",
        "name",
        "project_name",
        "status",
        "project_code",
        "project_number",
        "code",
      ],
      searchColumns: ["name", "project_name", "project_code", "project_number", "code"],
      term,
    }),
    searchWorkers(term),
    searchEntity({
      table: "plant",
      selectColumns: [
        "id",
        "plant_id",
        "name",
        "make",
        "model",
        "rego_number",
        "registration_code",
        "unit_number",
        "status",
      ],
      searchColumns: [
        "name",
        "plant_id",
        "rego_number",
        "registration_code",
        "unit_number",
        "make",
        "model",
      ],
      term,
    }),
    searchEntity({
      table: "organization_fleet",
      selectColumns: [
        "id",
        "vehicle_name",
        "unit_number",
        "rego_number",
        "registration",
        "make",
        "model",
      ],
      searchColumns: [
        "vehicle_name",
        "unit_number",
        "rego_number",
        "registration",
        "make",
        "model",
      ],
      term,
    }),
    searchEntity({
      table: PROJECT_ITPS_TABLE,
      selectColumns: [
        "id",
        "itp_number",
        "service",
        "service_type",
        "trade_category",
        "title",
        "project_id",
      ],
      searchColumns: ["itp_number", "service", "service_type", "trade_category", "title"],
      term,
    }),
    searchEntity({
      table: PROJECT_ITCS_TABLE,
      selectColumns: [
        "id",
        "activity_number",
        "itc_number",
        "service",
        "service_type",
        "service_discipline",
        "project_id",
      ],
      searchColumns: [
        "activity_number",
        "itc_number",
        "service",
        "service_type",
        "service_discipline",
      ],
      term,
    }),
  ]);

  const [projects, workers, plant, fleet, itps, itcs] = settled.map((result, index) => {
    const labels = ["projects", "workers", "plant", "fleet", "itps", "itcs"] as const;
    if (result.status === "fulfilled") return result.value;
    console.warn(`[global-search] ${labels[index]} failed:`, result.reason);
    return [] as Record<string, unknown>[];
  });

  console.log("[Search Query]:", term, { projects, workers, plant, fleet, itps, itcs });

  return {
    projects: mapHits(projects, (row) => {
      const id = str(row, "id");
      if (!id) return null;
      return {
        id,
        group: "projects",
        title: str(row, "name", "project_name") || "Untitled project",
        subtitle: str(row, "project_code", "project_number", "code", "status") || "Project",
        badge: str(row, "status") || "Project",
        href: `/projects/${id}`,
      };
    }),
    workers: mapHits(workers, (row) => {
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
      ...mapHits(plant, (row) => {
        const id = str(row, "id");
        if (!id) return null;
        const identity = str(row, "rego_number", "registration_code", "plant_id", "unit_number");
        return {
          id: `plant-${id}`,
          group: "plantFleet",
          title: str(row, "name", "unit_number", "plant_id") || "Plant asset",
          subtitle: [str(row, "make"), str(row, "model"), identity]
            .filter(Boolean)
            .join(" · "),
          badge: str(row, "status") || "Plant",
          href: `/organisation/plant?id=${encodeURIComponent(id)}&action=view`,
        };
      }),
      ...mapHits(fleet, (row) => {
        const id = str(row, "id");
        if (!id) return null;
        const identity = str(row, "rego_number", "registration", "unit_number");
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
      ...mapHits(itps, (row) => {
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
      ...mapHits(itcs, (row) => {
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
