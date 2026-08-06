import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId } from "./project-resolver";

export type AssetType = "site_laser" | "pressure_gauge";
export type AssetStatus = "active" | "in_service_calibration";

export interface Asset {
  id: string;
  asset_number: string;
  name: string;
  asset_type: AssetType;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  status: AssetStatus;
  next_service_due_date: string | null;
  next_calibration_due_date: string | null;
  assigned_project_id: string | null;
  service_contact_name: string | null;
  service_contact_company: string | null;
  service_contact_phone: string | null;
  service_contact_email: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssetLaserSignout {
  id: string;
  asset_id: string;
  project_id: string;
  worker_name: string | null;
  signed_out_at: string;
  signed_in_at: string | null;
  notes: string | null;
}

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  site_laser: "Site Laser",
  pressure_gauge: "Pressure Gauge",
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  in_service_calibration: "In Service/Calibration",
};

function normalizeAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id ?? ""),
    asset_number: String(row.asset_number ?? ""),
    name: String(row.name ?? ""),
    asset_type: (row.asset_type as AssetType) ?? "site_laser",
    make: (row.make as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serial_number: (row.serial_number as string | null) ?? null,
    status: (row.status as AssetStatus) ?? "active",
    next_service_due_date: (row.next_service_due_date as string | null) ?? null,
    next_calibration_due_date: (row.next_calibration_due_date as string | null) ?? null,
    assigned_project_id: (row.assigned_project_id as string | null) ?? null,
    service_contact_name: (row.service_contact_name as string | null) ?? null,
    service_contact_company: (row.service_contact_company as string | null) ?? null,
    service_contact_phone: (row.service_contact_phone as string | null) ?? null,
    service_contact_email: (row.service_contact_email as string | null) ?? null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
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

export async function fetchAssets(): Promise<Asset[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .order("asset_number");

    if (error) {
      if (!isMissingTableError(error.message, "assets")) {
        console.warn("fetchAssets failed:", error.message);
      }
      return [];
    }

    return (data ?? []).map((row) => normalizeAsset(row as Record<string, unknown>));
  } catch (error) {
    console.warn("fetchAssets threw:", error);
    return [];
  }
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;
    return normalizeAsset(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export interface AssetInput {
  asset_number: string;
  name: string;
  asset_type: AssetType;
  make?: string;
  model?: string;
  serial_number?: string;
  status?: AssetStatus;
  next_service_due_date?: string | null;
  next_calibration_due_date?: string | null;
  service_contact_name?: string;
  service_contact_company?: string;
  service_contact_phone?: string;
  service_contact_email?: string;
}

export async function addAsset(input: AssetInput): Promise<{ error: string | null; asset?: Asset }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const payload: Record<string, unknown> = {
    asset_number: input.asset_number.trim(),
    name: input.name.trim(),
    asset_type: input.asset_type,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    serial_number: input.serial_number?.trim() || null,
    status: input.status ?? "active",
    next_service_due_date: input.next_service_due_date || null,
    next_calibration_due_date: input.next_calibration_due_date || null,
    service_contact_name: input.service_contact_name?.trim() || null,
    service_contact_company: input.service_contact_company?.trim() || null,
    service_contact_phone: input.service_contact_phone?.trim() || null,
    service_contact_email: input.service_contact_email?.trim() || null,
  };

  try {
    const { data, error } = await supabase
      .from("assets")
      .insert(payload)
      .select("*")
      .single();

    if (error) return { error: error.message };
    return { error: null, asset: normalizeAsset(data as Record<string, unknown>) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add asset" };
  }
}

export async function updateAsset(
  id: string,
  input: Partial<AssetInput>
): Promise<{ error: string | null; asset?: Asset }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.asset_number !== undefined) payload.asset_number = input.asset_number.trim();
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.asset_type !== undefined) payload.asset_type = input.asset_type;
  if (input.make !== undefined) payload.make = input.make?.trim() || null;
  if (input.model !== undefined) payload.model = input.model?.trim() || null;
  if (input.serial_number !== undefined) payload.serial_number = input.serial_number?.trim() || null;
  if (input.status !== undefined) payload.status = input.status;
  if (input.next_service_due_date !== undefined) payload.next_service_due_date = input.next_service_due_date || null;
  if (input.next_calibration_due_date !== undefined) payload.next_calibration_due_date = input.next_calibration_due_date || null;
  if (input.service_contact_name !== undefined) payload.service_contact_name = input.service_contact_name?.trim() || null;
  if (input.service_contact_company !== undefined) payload.service_contact_company = input.service_contact_company?.trim() || null;
  if (input.service_contact_phone !== undefined) payload.service_contact_phone = input.service_contact_phone?.trim() || null;
  if (input.service_contact_email !== undefined) payload.service_contact_email = input.service_contact_email?.trim() || null;

  try {
    const { data, error } = await supabase
      .from("assets")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { error: error.message };
    return { error: null, asset: normalizeAsset(data as Record<string, unknown>) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update asset" };
  }
}

export async function deleteAsset(id: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete asset" };
  }
}

export interface ProjectAssetAssignment {
  id: string;
  project_id: string;
  asset_id: string;
}

export async function fetchProjectAssetAssignments(): Promise<ProjectAssetAssignment[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from("project_asset_assignments")
      .select("id, project_id, asset_id");

    if (error) {
      if (!isMissingTableError(error.message, "project_asset_assignments")) {
        console.warn("fetchProjectAssetAssignments failed:", error.message);
      }
      return [];
    }

    return (data ?? []) as ProjectAssetAssignment[];
  } catch (error) {
    console.warn("fetchProjectAssetAssignments threw:", error);
    return [];
  }
}

export function buildAssetProjectMap(
  assignments: ProjectAssetAssignment[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of assignments) {
    const list = map.get(row.asset_id) ?? [];
    if (!list.includes(row.project_id)) list.push(row.project_id);
    map.set(row.asset_id, list);
  }
  return map;
}

export function getAssetAssignedProjectIds(
  asset: Pick<Asset, "assigned_project_id">,
  junctionIds: string[] = []
): string[] {
  const ids = new Set(junctionIds.filter(Boolean));
  if (asset.assigned_project_id) ids.add(asset.assigned_project_id);
  return [...ids];
}

export async function assignAssetToProject(
  assetId: string,
  projectId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { id: resolvedId, error: resolveError } = await resolveProjectId(projectId);
    if (resolveError || !resolvedId) return { error: resolveError ?? "Project not found" };

    const existing = await fetchProjectAssetAssignments();
    const currentAssignment = existing.find((row) => row.asset_id === assetId);

    if (currentAssignment && currentAssignment.project_id !== resolvedId) {
      await supabase
        .from("project_asset_assignments")
        .delete()
        .eq("id", currentAssignment.id);
    }

    const { error: upsertError } = await supabase
      .from("project_asset_assignments")
      .upsert(
        { project_id: resolvedId, asset_id: assetId },
        { onConflict: "project_id,asset_id" }
      );

    if (upsertError && !isMissingTableError(upsertError.message, "project_asset_assignments")) {
      return { error: upsertError.message };
    }

    await supabase
      .from("assets")
      .update({ assigned_project_id: resolvedId, updated_at: new Date().toISOString() })
      .eq("id", assetId);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to assign asset" };
  }
}

export async function unassignAssetFromProject(
  assetId: string,
  projectId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { id: resolvedId } = await resolveProjectId(projectId);

    await supabase
      .from("project_asset_assignments")
      .delete()
      .eq("asset_id", assetId)
      .eq("project_id", resolvedId ?? projectId);

    await supabase
      .from("assets")
      .update({ assigned_project_id: null, updated_at: new Date().toISOString() })
      .eq("id", assetId);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to unassign asset" };
  }
}

export function filterAssetsForProject(
  assets: Asset[],
  projectId: string,
  assetProjectMap: Map<string, string[]>
): Asset[] {
  return assets.filter((asset) => {
    const junctionIds = assetProjectMap.get(asset.id) ?? [];
    return getAssetAssignedProjectIds(asset, junctionIds).includes(projectId);
  });
}

export async function fetchLaserSignouts(projectId?: string): Promise<AssetLaserSignout[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    let query = supabase
      .from("asset_laser_signouts")
      .select("*")
      .order("signed_out_at", { ascending: false });

    if (projectId) {
      const { id: resolvedId } = await resolveProjectId(projectId);
      query = query.eq("project_id", resolvedId ?? projectId);
    }

    const { data, error } = await query;

    if (error) {
      if (!isMissingTableError(error.message, "asset_laser_signouts")) {
        console.warn("fetchLaserSignouts failed:", error.message);
      }
      return [];
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      asset_id: String(row.asset_id),
      project_id: String(row.project_id),
      worker_name: row.worker_name ?? null,
      signed_out_at: String(row.signed_out_at),
      signed_in_at: row.signed_in_at ?? null,
      notes: row.notes ?? null,
    }));
  } catch (error) {
    console.warn("fetchLaserSignouts threw:", error);
    return [];
  }
}

export async function signOutLaser(
  assetId: string,
  projectId: string,
  workerName?: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { id: resolvedId } = await resolveProjectId(projectId);
    const { error } = await supabase.from("asset_laser_signouts").insert({
      asset_id: assetId,
      project_id: resolvedId ?? projectId,
      worker_name: workerName?.trim() || null,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to sign out laser" };
  }
}

export async function signInLaser(signoutId: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { error } = await supabase
      .from("asset_laser_signouts")
      .update({ signed_in_at: new Date().toISOString() })
      .eq("id", signoutId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to sign in laser" };
  }
}

export async function updateAssetStatus(
  assetId: string,
  status: AssetStatus
): Promise<{ error: string | null }> {
  return updateAsset(assetId, { status });
}

export function validateAssetInput(input: AssetInput): string | null {
  if (!input.asset_number.trim()) return "Asset # is required";
  if (!input.name.trim()) return "Name is required";
  if (!input.next_calibration_due_date) return "Next Calibration Due Date is required";
  if (input.asset_type === "site_laser" && !input.next_service_due_date) {
    return "Next Service Due Date is required for Site Lasers";
  }
  return null;
}

export function getActiveLaserSignouts(
  signouts: AssetLaserSignout[]
): AssetLaserSignout[] {
  return signouts.filter((row) => !row.signed_in_at);
}

export function isLaserOverdueNotReturned(signout: AssetLaserSignout): boolean {
  if (signout.signed_in_at) return false;
  const signedOut = new Date(signout.signed_out_at);
  const now = new Date();
  const cutoff = new Date(signedOut);
  cutoff.setHours(17, 0, 0, 0);
  if (now <= cutoff) return false;
  const sameDay =
    signedOut.getFullYear() === now.getFullYear() &&
    signedOut.getMonth() === now.getMonth() &&
    signedOut.getDate() === now.getDate();
  return sameDay;
}

export function hasLaserWarningToday(signouts: AssetLaserSignout[]): boolean {
  const now = new Date();
  if (now.getHours() < 17) return false;
  return signouts.some(isLaserOverdueNotReturned);
}
