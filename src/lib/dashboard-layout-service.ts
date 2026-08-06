import { supabase, isSupabaseConfigured } from "./supabase";
import type { SecurityRole } from "./security-roles";
import {
  getDefaultWidgets,
  normalizeWidgetOrder,
  type DashboardLayoutRecord,
  type DashboardType,
  type DashboardWidgetConfig,
} from "./dashboard-layouts";

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("dashboard_layouts") &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

export async function fetchDashboardLayout(
  userId: string,
  dashboardType: DashboardType,
  projectId?: string | null
): Promise<DashboardWidgetConfig[] | null> {
  if (!isSupabaseConfigured() || !userId) return null;

  try {
    let query = supabase
      .from("dashboard_layouts")
      .select("widget_order")
      .eq("user_id", userId)
      .eq("dashboard_type", dashboardType);

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      if (!isMissingTableError(error.message)) {
        console.warn("fetchDashboardLayout failed:", error.message);
      }
      return null;
    }

    if (!data?.widget_order) return null;
    return normalizeWidgetOrder(
      data.widget_order as DashboardWidgetConfig[],
      getDefaultWidgets(dashboardType)
    );
  } catch (error) {
    console.warn("fetchDashboardLayout threw:", error);
    return null;
  }
}

export async function saveDashboardLayout(
  record: DashboardLayoutRecord
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };
  if (!record.user_id) return { error: "User ID is required" };

  const payload = {
    user_id: record.user_id,
    role: record.role,
    dashboard_type: record.dashboard_type,
    project_id: record.project_id,
    widget_order: record.widget_order,
    updated_at: new Date().toISOString(),
  };

  try {
    let readQuery = supabase
      .from("dashboard_layouts")
      .select("id")
      .eq("user_id", record.user_id)
      .eq("dashboard_type", record.dashboard_type);

    if (record.project_id) {
      readQuery = readQuery.eq("project_id", record.project_id);
    } else {
      readQuery = readQuery.is("project_id", null);
    }

    const { data: existing, error: readError } = await readQuery.maybeSingle();

    if (readError && !isMissingTableError(readError.message)) {
      return { error: readError.message };
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("dashboard_layouts")
        .update(payload)
        .eq("id", existing.id);
      if (error) return { error: error.message };
      return { error: null };
    }

    const { error } = await supabase.from("dashboard_layouts").insert(payload);
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save dashboard layout",
    };
  }
}

export async function deleteDashboardLayout(
  userId: string,
  dashboardType: DashboardType,
  projectId?: string | null
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured() || !userId) return { error: null };

  try {
    let query = supabase
      .from("dashboard_layouts")
      .delete()
      .eq("user_id", userId)
      .eq("dashboard_type", dashboardType);

    if (projectId) {
      query = query.eq("project_id", projectId);
    } else {
      query = query.is("project_id", null);
    }

    const { error } = await query;
    if (error && !isMissingTableError(error.message)) {
      return { error: error.message };
    }
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to reset dashboard layout",
    };
  }
}

export type { SecurityRole };
