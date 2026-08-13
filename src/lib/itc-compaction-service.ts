import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId } from "./project-resolver";
import { isWithinProximityMeters } from "./itc-geo-utils";

export interface ItcCompactionTest {
  id: string;
  project_id: string;
  test_number: string;
  company_name: string | null;
  technician_name: string | null;
  mark_x: number | null;
  mark_y: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  map_lat: number | null;
  map_lng: number | null;
  signature_url: string | null;
  tested_at: string | null;
  created_at?: string;
  linked_itc_ids?: string[];
}

export interface ItcCompactionTestInput {
  projectId: string;
  testNumber: string;
  companyName?: string;
  technicianName?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  signatureUrl?: string | null;
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function normalizeTest(row: Record<string, unknown>): ItcCompactionTest {
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    test_number: String(row.test_number ?? ""),
    company_name: row.company_name ? String(row.company_name) : null,
    technician_name: row.technician_name ? String(row.technician_name) : null,
    mark_x: row.mark_x != null ? Number(row.mark_x) : null,
    mark_y: row.mark_y != null ? Number(row.mark_y) : null,
    gps_lat: row.gps_lat != null ? Number(row.gps_lat) : null,
    gps_lng: row.gps_lng != null ? Number(row.gps_lng) : null,
    map_lat: row.map_lat != null ? Number(row.map_lat) : null,
    map_lng: row.map_lng != null ? Number(row.map_lng) : null,
    signature_url: row.signature_url ? String(row.signature_url) : null,
    tested_at: row.tested_at ? String(row.tested_at) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    linked_itc_ids: Array.isArray(row.linked_itc_ids)
      ? row.linked_itc_ids.map(String)
      : undefined,
  };
}

export async function fetchCompactionTests(
  projectId: string
): Promise<ItcCompactionTest[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const resolved = (await resolveProjectId(projectId)).id ?? projectId;
  const { data, error } = await supabase
    .from("itc_compaction_tests")
    .select("*")
    .eq("project_id", resolved)
    .order("created_at", { ascending: false });

  if (error) {
    if (!isMissingTableError(error.message, "itc_compaction_tests")) {
      console.warn("fetchCompactionTests failed:", error.message);
    }
    return [];
  }

  const tests = (data ?? []).map((row) => normalizeTest(row as Record<string, unknown>));
  const testIds = tests.map((row) => row.id);
  if (testIds.length === 0) return tests;

  const { data: links } = await supabase
    .from("itc_compaction_test_links")
    .select("test_id, itc_id")
    .in("test_id", testIds);

  const linksByTest = new Map<string, string[]>();
  for (const link of links ?? []) {
    const testId = String((link as { test_id: string }).test_id);
    const itcId = String((link as { itc_id: string }).itc_id);
    const list = linksByTest.get(testId) ?? [];
    list.push(itcId);
    linksByTest.set(testId, list);
  }

  return tests.map((test) => ({
    ...test,
    linked_itc_ids: linksByTest.get(test.id) ?? [],
  }));
}

export async function createCompactionTest(
  input: ItcCompactionTestInput
): Promise<{ error: string | null; test?: ItcCompactionTest }> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured" };
  }

  const resolved = (await resolveProjectId(input.projectId)).id ?? input.projectId;
  const payload = {
    project_id: resolved,
    test_number: input.testNumber.trim(),
    company_name: input.companyName?.trim() || null,
    technician_name: input.technicianName?.trim() || null,
    gps_lat: input.gpsLat ?? null,
    gps_lng: input.gpsLng ?? null,
    map_lat: input.gpsLat ?? null,
    map_lng: input.gpsLng ?? null,
    signature_url: input.signatureUrl ?? null,
    tested_at: now,
  };

  const { data, error } = await supabase
    .from("itc_compaction_tests")
    .insert([payload])
    .select("*")
    .single();

  if (error) return { error: error.message };

  const test = normalizeTest(data as Record<string, unknown>);
  await autoLinkCompactionTest(test.id, resolved, input.gpsLat, input.gpsLng);
  const refreshed = await fetchCompactionTests(input.projectId);
  const saved = refreshed.find((row) => row.id === test.id) ?? test;
  return { error: null, test: saved };
}

async function autoLinkCompactionTest(
  testId: string,
  projectId: string,
  gpsLat?: number | null,
  gpsLng?: number | null
): Promise<void> {
  if (gpsLat == null || gpsLng == null || !isSupabaseConfigured()) return;

  const { data: itcs } = await supabase
    .from("project_itcs")
    .select("id, gps_lat, gps_lng")
    .eq("project_id", projectId);

  const links: Array<{ test_id: string; itc_id: string }> = [];

  for (const row of itcs ?? []) {
    const itcId = String((row as { id: string }).id);
    const itcLat = (row as { gps_lat?: number | null }).gps_lat;
    const itcLng = (row as { gps_lng?: number | null }).gps_lng;

    if (itcLat != null && itcLng != null) {
      if (isWithinProximityMeters(gpsLat, gpsLng, Number(itcLat), Number(itcLng))) {
        links.push({ test_id: testId, itc_id: itcId });
      }
    }
  }

  if (links.length === 0) return;

  await supabase
    .from("itc_compaction_test_links")
    .upsert(links, { onConflict: "test_id,itc_id", ignoreDuplicates: true });
}

export async function linkItcToNearbyCompactionTests(
  itcId: string,
  projectId: string,
  gpsLat: number,
  gpsLng: number
): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];

  const tests = await fetchCompactionTests(projectId);
  const linked: string[] = [];

  for (const test of tests) {
    if (test.gps_lat == null || test.gps_lng == null) continue;
    if (!isWithinProximityMeters(gpsLat, gpsLng, test.gps_lat, test.gps_lng)) continue;

    const { error } = await supabase
      .from("itc_compaction_test_links")
      .upsert(
        [{ test_id: test.id, itc_id: itcId }],
        { onConflict: "test_id,itc_id", ignoreDuplicates: true }
      );

    if (!error) linked.push(test.test_number);
  }

  return linked;
}

export function readBrowserGeolocation(): Promise<{
  lat: number;
  lng: number;
} | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30_000 }
    );
  });
}
