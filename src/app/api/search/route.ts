import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminItcPath } from "@/lib/console-nav-routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type SearchRow = Record<string, unknown>;

export interface SearchApiHit {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
}

export interface SearchApiResponse {
  projects: SearchApiHit[];
  workers: SearchApiHit[];
  plant: SearchApiHit[];
  fleet: SearchApiHit[];
  itps: SearchApiHit[];
  itcs: SearchApiHit[];
}

const LIMIT = 10;

function emptyResponse(): SearchApiResponse {
  return {
    projects: [],
    workers: [],
    plant: [],
    fleet: [],
    itps: [],
    itcs: [],
  };
}

function asRecord(value: unknown): SearchRow {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as SearchRow;
  }
  return {};
}

function str(row: SearchRow, ...keys: string[]): string {
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

function sanitizeOrTerm(raw: string): string {
  return raw.replace(/[%_,()]/g, "").replace(/\s+/g, "%").trim().slice(0, 64);
}

function logTableError(
  tableName: string,
  error: { message?: string; details?: string } | null | undefined
): void {
  console.error(
    "[Search Table Error - " + tableName + "]:",
    error?.message,
    error?.details
  );
}

async function searchProjects(
  supabase: SearchClient,
  term: string
): Promise<SearchApiHit[]> {
  try {
    const named = await supabase
      .from("projects")
      .select("id, name")
      .ilike("name", `%${term}%`)
      .limit(LIMIT);

    if (!named.error) {
      return (named.data ?? []).map((row) => mapProject(asRecord(row)));
    }
    logTableError("projects", named.error);

    const fallback = await supabase
      .from("projects")
      .select("id, project_name")
      .ilike("project_name", `%${term}%`)
      .limit(LIMIT);

    if (fallback.error) {
      logTableError("projects", fallback.error);
      return [];
    }
    return (fallback.data ?? []).map((row) => mapProject(asRecord(row)));
  } catch (error) {
    logTableError("projects", error as { message?: string });
    return [];
  }
}

async function searchWorkers(
  supabase: SearchClient,
  term: string
): Promise<SearchApiHit[]> {
  try {
    const orTerm = sanitizeOrTerm(term);
    if (!orTerm) return [];

    const tokens = normalizeTerm(term).split(" ").filter(Boolean);
    const rows = new Map<string, SearchRow>();

    const probe = await supabase
      .from("workers")
      .select("id, email, name, first_name, last_name")
      .or(`name.ilike.%${orTerm}%,email.ilike.%${orTerm}%,first_name.ilike.%${orTerm}%,last_name.ilike.%${orTerm}%`)
      .limit(LIMIT);

    if (probe.error) {
      logTableError("workers", probe.error);
      const fallback = await supabase
        .from("workers")
        .select("id, email, first_name, last_name")
        .or(`email.ilike.%${orTerm}%,first_name.ilike.%${orTerm}%,last_name.ilike.%${orTerm}%`)
        .limit(LIMIT);
      if (fallback.error) {
        logTableError("workers", fallback.error);
      } else {
        for (const row of fallback.data ?? []) {
          const record = asRecord(row);
          const id = str(record, "id");
          if (id) rows.set(id, record);
        }
      }
    } else {
      for (const row of probe.data ?? []) {
        const record = asRecord(row);
        const id = str(record, "id");
        if (id) rows.set(id, record);
      }
    }

    if (tokens.length >= 2) {
      const first = tokens[0] ?? "";
      const last = tokens[tokens.length - 1] ?? "";
      const split = await supabase
        .from("workers")
        .select("id, email, first_name, last_name")
        .ilike("first_name", `%${first}%`)
        .ilike("last_name", `%${last}%`)
        .limit(LIMIT);
      if (split.error) {
        logTableError("workers", split.error);
      } else {
        for (const row of split.data ?? []) {
          const record = asRecord(row);
          const id = str(record, "id");
          if (id) rows.set(id, record);
        }
      }
    }

    return [...rows.values()].map(mapWorker).slice(0, LIMIT);
  } catch (error) {
    logTableError("workers", error as { message?: string });
    return [];
  }
}

async function searchPlant(
  supabase: SearchClient,
  term: string
): Promise<SearchApiHit[]> {
  try {
    const orTerm = sanitizeOrTerm(term);
    if (!orTerm) return [];

    const primary = await supabase
      .from("plant")
      .select("id, name, plant_id, rego_number")
      .or(`name.ilike.%${orTerm}%,plant_id.ilike.%${orTerm}%`)
      .limit(LIMIT);

    if (!primary.error) {
      return (primary.data ?? []).map((row) => mapPlant(asRecord(row)));
    }
    logTableError("plant", primary.error);

    const fallback = await supabase
      .from("plant")
      .select("id, name, plant_id, unit_number, registration_code")
      .or(`name.ilike.%${orTerm}%,plant_id.ilike.%${orTerm}%,unit_number.ilike.%${orTerm}%`)
      .limit(LIMIT);

    if (fallback.error) {
      logTableError("plant", fallback.error);
      const nameOnly = await supabase
        .from("plant")
        .select("id, name, plant_id")
        .ilike("name", `%${term}%`)
        .limit(LIMIT);
      if (nameOnly.error) {
        logTableError("plant", nameOnly.error);
        return [];
      }
      return (nameOnly.data ?? []).map((row) => mapPlant(asRecord(row)));
    }

    return (fallback.data ?? []).map((row) => mapPlant(asRecord(row)));
  } catch (error) {
    logTableError("plant", error as { message?: string });
    return [];
  }
}

async function searchFleet(
  supabase: SearchClient,
  term: string
): Promise<SearchApiHit[]> {
  try {
    const orTerm = sanitizeOrTerm(term);
    if (!orTerm) return [];

    const primary = await supabase
      .from("organization_fleet")
      .select("id, make, model, rego_number")
      .or(`rego_number.ilike.%${orTerm}%,make.ilike.%${orTerm}%,model.ilike.%${orTerm}%`)
      .limit(LIMIT);

    if (!primary.error) {
      return (primary.data ?? []).map((row) => mapFleet(asRecord(row)));
    }
    logTableError("organization_fleet", primary.error);

    const fallback = await supabase
      .from("organization_fleet")
      .select("id, make, model, unit_number, registration")
      .or(`unit_number.ilike.%${orTerm}%,registration.ilike.%${orTerm}%,make.ilike.%${orTerm}%,model.ilike.%${orTerm}%`)
      .limit(LIMIT);

    if (fallback.error) {
      logTableError("organization_fleet", fallback.error);
      return [];
    }
    return (fallback.data ?? []).map((row) => mapFleet(asRecord(row)));
  } catch (error) {
    logTableError("organization_fleet", error as { message?: string });
    return [];
  }
}

async function searchItps(
  supabase: SearchClient,
  term: string
): Promise<SearchApiHit[]> {
  try {
    const primary = await supabase
      .from("project_itps")
      .select("id, itp_number, project_id")
      .ilike("itp_number", `%${term}%`)
      .limit(LIMIT);

    if (!primary.error) {
      return (primary.data ?? []).map((row) => mapItp(asRecord(row)));
    }
    logTableError("project_itps", primary.error);
    return [];
  } catch (error) {
    logTableError("project_itps", error as { message?: string });
    return [];
  }
}

async function searchItcs(
  supabase: SearchClient,
  term: string
): Promise<SearchApiHit[]> {
  try {
    const primary = await supabase
      .from("project_itcs")
      .select("id, activity_number, project_id")
      .ilike("activity_number", `%${term}%`)
      .limit(LIMIT);

    if (!primary.error) {
      return (primary.data ?? []).map((row) => mapItc(asRecord(row)));
    }
    logTableError("project_itcs", primary.error);

    const fallback = await supabase
      .from("project_itcs")
      .select("id, itc_number, project_id")
      .ilike("itc_number", `%${term}%`)
      .limit(LIMIT);

    if (fallback.error) {
      logTableError("project_itcs", fallback.error);
      return [];
    }
    return (fallback.data ?? []).map((row) => mapItc(asRecord(row)));
  } catch (error) {
    logTableError("project_itcs", error as { message?: string });
    return [];
  }
}

function mapProject(row: SearchRow): SearchApiHit {
  const id = str(row, "id");
  return {
    id,
    title: str(row, "name", "project_name") || "Untitled project",
    subtitle: "Project",
    badge: "Project",
    href: `/projects/${id}`,
  };
}

function mapWorker(row: SearchRow): SearchApiHit {
  const id = str(row, "id");
  const fullName =
    [str(row, "first_name"), str(row, "last_name")].filter(Boolean).join(" ") ||
    str(row, "name", "email") ||
    "Worker";
  return {
    id,
    title: fullName,
    subtitle: str(row, "email"),
    badge: "Worker",
    href: `/organisation/workers?id=${encodeURIComponent(id)}&action=view`,
  };
}

function mapPlant(row: SearchRow): SearchApiHit {
  const id = str(row, "id");
  return {
    id: `plant-${id}`,
    title: str(row, "name", "plant_id", "unit_number") || "Plant asset",
    subtitle: str(row, "rego_number", "registration_code", "plant_id", "unit_number"),
    badge: "Plant",
    href: `/organisation/plant?id=${encodeURIComponent(id)}&action=view`,
  };
}

function mapFleet(row: SearchRow): SearchApiHit {
  const id = str(row, "id");
  return {
    id: `fleet-${id}`,
    title: [str(row, "make"), str(row, "model")].filter(Boolean).join(" ") ||
      str(row, "unit_number") ||
      "Fleet vehicle",
    subtitle: str(row, "rego_number", "registration", "unit_number"),
    badge: "Fleet",
    href: `/organisation/fleet?id=${encodeURIComponent(id)}&action=view`,
  };
}

function mapItp(row: SearchRow): SearchApiHit {
  const id = str(row, "id");
  const projectId = str(row, "project_id");
  return {
    id: `itp-${id}`,
    title: str(row, "itp_number") || "ITP",
    subtitle: "ITP",
    badge: "ITP",
    href: projectId ? `/projects/${projectId}` : "/admin/itc",
  };
}

function mapItc(row: SearchRow): SearchApiHit {
  const id = str(row, "id");
  return {
    id: `itc-${id}`,
    title: str(row, "activity_number", "itc_number") || "ITC",
    subtitle: "ITC",
    badge: "ITC",
    href: getAdminItcPath(id),
  };
}

function settledHits(
  result: PromiseSettledResult<SearchApiHit[]>,
  tableName: string
): SearchApiHit[] {
  if (result.status === "fulfilled") return result.value.filter((hit) => hit.id);
  logTableError(tableName, { message: String(result.reason) });
  return [];
}

export async function GET(request: Request) {
  const term = normalizeTerm(new URL(request.url).searchParams.get("q") ?? "");
  if (!term) {
    return NextResponse.json(emptyResponse(), { status: 200 });
  }

  try {
    const supabase = await createSupabaseServerClient();

    const settled = await Promise.allSettled([
      searchProjects(supabase, term),
      searchWorkers(supabase, term),
      searchPlant(supabase, term),
      searchFleet(supabase, term),
      searchItps(supabase, term),
      searchItcs(supabase, term),
    ]);

    const payload: SearchApiResponse = {
      projects: settledHits(settled[0]!, "projects"),
      workers: settledHits(settled[1]!, "workers"),
      plant: settledHits(settled[2]!, "plant"),
      fleet: settledHits(settled[3]!, "organization_fleet"),
      itps: settledHits(settled[4]!, "project_itps"),
      itcs: settledHits(settled[5]!, "project_itcs"),
    };

    console.log("[Search Query]:", term, payload);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error("[Search Table Error - search]:", error);
    return NextResponse.json(emptyResponse(), { status: 200 });
  }
}
