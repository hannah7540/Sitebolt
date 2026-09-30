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

interface SearchApiHit {
  id?: string;
  title?: string;
  subtitle?: string;
  badge?: string;
  href?: string;
}

interface SearchApiResponse {
  projects?: SearchApiHit[];
  workers?: SearchApiHit[];
  plant?: SearchApiHit[];
  fleet?: SearchApiHit[];
  itps?: SearchApiHit[];
  itcs?: SearchApiHit[];
}

function asHits(
  rows: SearchApiHit[] | undefined,
  group: GlobalSearchGroup
): GlobalSearchHit[] {
  return (rows ?? [])
    .filter((row) => Boolean(row.id && row.href))
    .map((row) => ({
      id: String(row.id),
      group,
      title: row.title?.trim() || "Untitled",
      subtitle: row.subtitle?.trim() || "",
      badge: row.badge?.trim() || group,
      href: String(row.href),
    }));
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
  const term = rawQuery.replace(/\s+/g, " ").trim();
  if (!term) return EMPTY_GLOBAL_SEARCH_RESULTS;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("[Search Query]: API returned", response.status);
      return EMPTY_GLOBAL_SEARCH_RESULTS;
    }

    const payload = (await response.json()) as SearchApiResponse;
    const results: GlobalSearchResults = {
      projects: asHits(payload.projects, "projects"),
      workers: asHits(payload.workers, "workers"),
      plantFleet: [
        ...asHits(payload.plant, "plantFleet"),
        ...asHits(payload.fleet, "plantFleet"),
      ],
      itpItc: [...asHits(payload.itps, "itpItc"), ...asHits(payload.itcs, "itpItc")],
    };
    console.log("[Search Query]:", term, payload);
    return results;
  } catch (error) {
    console.error("[Search Query]: request failed", error);
    return EMPTY_GLOBAL_SEARCH_RESULTS;
  }
}
