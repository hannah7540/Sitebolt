import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeWritePayload } from "./form-payload-utils";
import { getItpTemplate, type ItpPointType } from "./itp-templates";
import { resolveProjectId } from "./project-resolver";
import {
  DEFAULT_ITC_FORM_STEPS,
  deriveItcStatus,
} from "./itc-templates";

export interface CreateItpItemInput {
  item_number: number;
  description: string;
  acceptance_criteria?: string;
  point_type: ItpPointType;
}

export interface CreateItpAdminInput {
  project_id: string;
  title: string;
  trade_category: string;
  subcontractor_name?: string;
  location_area?: string;
  revision?: string;
  template_key?: string;
  items?: CreateItpItemInput[];
}

function stripPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeWritePayload(
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  );
}

async function resolveProject(projectId: string): Promise<string> {
  const { id } = await resolveProjectId(projectId);
  return id ?? projectId;
}

async function nextItpNumber(
  admin: SupabaseClient,
  projectId: string
): Promise<string> {
  const { data } = await admin
    .from("project_itps")
    .select("itp_number")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  const numbers = (data ?? [])
    .map((row) => String(row.itp_number ?? ""))
    .map((value) => {
      const match = value.match(/(\d+)\s*$/);
      return match ? Number(match[1]) : 0;
    });

  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  return `ITP-${String(next).padStart(3, "0")}`;
}

export async function createProjectItpAdmin(
  admin: SupabaseClient,
  input: CreateItpAdminInput
): Promise<{ error: string | null; itpId?: string }> {
  try {
    const resolvedProjectId = await resolveProject(input.project_id);
    const itpNumber = await nextItpNumber(admin, resolvedProjectId);

    let items = input.items ?? [];
    if (input.template_key && items.length === 0) {
      const template = getItpTemplate(input.template_key);
      if (template) {
        items = template.items.map((item) => ({
          item_number: item.item_number,
          description: item.description,
          acceptance_criteria: item.acceptance_criteria,
          point_type: item.point_type,
        }));
      }
    }

    const headerPayload = stripPayload({
      project_id: resolvedProjectId,
      itp_number: itpNumber,
      title: input.title.trim(),
      revision: input.revision?.trim() || "A",
      trade_category: input.trade_category,
      subcontractor_name: input.subcontractor_name?.trim() || null,
      location_area: input.location_area?.trim() || null,
      status: "draft",
      template_key: input.template_key ?? null,
      updated_at: new Date().toISOString(),
    });

    const { data: itpRow, error: itpError } = await admin
      .from("project_itps")
      .insert(headerPayload)
      .select("id")
      .single();

    if (itpError || !itpRow) {
      return { error: itpError?.message ?? "Failed to create ITP" };
    }

    const itpId = String(itpRow.id);

    if (items.length > 0) {
      const itemPayload = items.map((item, index) =>
        stripPayload({
          itp_id: itpId,
          item_number: item.item_number,
          description: item.description,
          acceptance_criteria: item.acceptance_criteria ?? null,
          point_type: item.point_type,
          status: "pending",
          sort_order: index,
          updated_at: new Date().toISOString(),
        })
      );

      const { error: itemsError } = await admin.from("project_itp_items").insert(itemPayload);
      if (itemsError) {
        await admin.from("project_itps").delete().eq("id", itpId);
        return { error: itemsError.message };
      }
    }

    return { error: null, itpId };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create ITP",
    };
  }
}

export async function updateItpStatusAdmin(
  admin: SupabaseClient,
  itpId: string,
  status: string
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("project_itps")
    .update(
      stripPayload({
        status,
        updated_at: new Date().toISOString(),
      })
    )
    .eq("id", itpId);

  return { error: error?.message ?? null };
}

export async function updateItpItemAdmin(
  admin: SupabaseClient,
  itemId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const { error } = await admin
    .from("project_itp_items")
    .update(
      stripPayload({
        ...patch,
        updated_at: new Date().toISOString(),
      })
    )
    .eq("id", itemId);

  return { error: error?.message ?? null };
}

export async function submitItcSignoffAdmin(
  admin: SupabaseClient,
  input: {
    signoffId: string;
    itcId: string;
    signedByWorkerId: string;
    autoVerify?: boolean;
    verifiedBy?: string;
    verifiedByName?: string;
  }
): Promise<{ error: string | null }> {
  const { data: signoffRow, error: fetchError } = await admin
    .from("itc_signoffs")
    .select("*")
    .eq("id", input.signoffId)
    .maybeSingle();

  if (fetchError || !signoffRow) {
    return { error: fetchError?.message ?? "Sign-off not found." };
  }

  if (signoffRow.status === "submitted") {
    return { error: "This step is already submitted and locked." };
  }

  if (!signoffRow.signature_url) {
    return { error: "A signature is required before submitting this step." };
  }

  const submittedAt = new Date().toISOString();
  const verifyPayload = input.autoVerify
    ? {
        verified_by: input.verifiedBy ?? input.signedByWorkerId,
        verified_by_name: input.verifiedByName?.trim() || null,
        verified_at: submittedAt,
      }
    : {};

  const { error: submitError } = await admin
    .from("itc_signoffs")
    .update(
      stripPayload({
        status: "submitted",
        submitted_at: submittedAt,
        signed_at: submittedAt,
        signed_by_worker_id: input.signedByWorkerId,
        updated_at: submittedAt,
        ...verifyPayload,
      })
    )
    .eq("id", input.signoffId)
    .eq("status", "draft");

  if (submitError) return { error: submitError.message };

  const { data: signoffs, error: signoffsError } = await admin
    .from("itc_signoffs")
    .select("step_index, status")
    .eq("itc_id", input.itcId)
    .eq("status", "submitted");

  if (signoffsError) {
    return { error: signoffsError.message };
  }

  const submittedCount = new Set(
    (signoffs ?? []).map((row) => Number(row.step_index))
  ).size;
  const progress = Math.round((submittedCount / DEFAULT_ITC_FORM_STEPS.length) * 100);
  const status = deriveItcStatus({
    progress_percent: progress,
    has_open_cr: false,
    submittedSteps: submittedCount,
  });

  const { error: itcUpdateError } = await admin
    .from("project_itcs")
    .update(
      stripPayload({
        progress_percent: progress,
        status,
        updated_at: submittedAt,
      })
    )
    .eq("id", input.itcId);

  if (itcUpdateError) {
    return { error: itcUpdateError.message };
  }

  return { error: null };
}
