import type { SupabaseClient } from "@supabase/supabase-js";
import { getItpTemplate, type ItpPointType } from "./itp-templates";
import { resolveProjectId } from "./project-resolver";
import {
  DEFAULT_ITC_FORM_STEPS,
  deriveItcStatus,
} from "./itc-templates";
import {
  ITC_SIGNOFF_COLUMNS,
  ITC_SIGNOFFS_TABLE,
  PROJECT_ITC_COLUMNS,
  PROJECT_ITCS_TABLE,
  PROJECT_ITP_COLUMNS,
  PROJECT_ITP_ITEM_COLUMNS,
  PROJECT_ITP_ITEMS_TABLE,
  PROJECT_ITPS_TABLE,
  retryItpItcWrite,
  retryItpItcWriteMany,
  sanitizeItpItcWritePayload,
} from "./itp-itc-payload";

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

function stripPayload(
  payload: Record<string, unknown>,
  columns: readonly string[],
  complete = false
): Record<string, unknown> {
  return sanitizeItpItcWritePayload(payload, columns, { complete });
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
    .from(PROJECT_ITPS_TABLE)
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
      form_data: { items, checklist: items },
      updated_at: new Date().toISOString(),
    }, PROJECT_ITP_COLUMNS);

    const insertResult = await retryItpItcWrite(
      "admin.project_itps.insert",
      headerPayload,
      async (payload) => {
        const { data, error } = await admin
          .from(PROJECT_ITPS_TABLE)
          .insert(payload)
          .select("id")
          .single();
        return { data, error };
      }
    );

    if (insertResult.error || !insertResult.data) {
      return { error: insertResult.error ?? "Failed to create ITP" };
    }

    const itpId = String((insertResult.data as { id: string }).id);

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
          photo_urls: [],
          checklist: [],
          form_data: {},
          updated_at: new Date().toISOString(),
        }, PROJECT_ITP_ITEM_COLUMNS)
      );

      const itemsResult = await retryItpItcWriteMany(
        "admin.project_itp_items.insert",
        itemPayload,
        async (rows) => {
          const { error } = await admin.from(PROJECT_ITP_ITEMS_TABLE).insert(rows);
          return { error };
        }
      );
      if (itemsResult.error) {
        await admin.from(PROJECT_ITPS_TABLE).delete().eq("id", itpId);
        return { error: itemsResult.error };
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
  const complete =
    status === "submitted" || status === "approved" || status === "completed";
  const result = await retryItpItcWrite(
    "admin.project_itps.status",
    stripPayload(
      {
        status,
        updated_at: new Date().toISOString(),
        completed_at: complete ? new Date().toISOString() : undefined,
      },
      PROJECT_ITP_COLUMNS,
      status === "completed"
    ),
    async (payload) => {
      const { error } = await admin.from(PROJECT_ITPS_TABLE).update(payload).eq("id", itpId);
      return { error };
    }
  );
  return { error: result.error };
}

export async function updateItpItemAdmin(
  admin: SupabaseClient,
  itemId: string,
  patch: Record<string, unknown>
): Promise<{ error: string | null }> {
  const result = await retryItpItcWrite(
    "admin.project_itp_items.update",
    stripPayload(
      {
        ...patch,
        updated_at: new Date().toISOString(),
      },
      PROJECT_ITP_ITEM_COLUMNS
    ),
    async (payload) => {
      const { error } = await admin.from(PROJECT_ITP_ITEMS_TABLE).update(payload).eq("id", itemId);
      return { error };
    }
  );
  return { error: result.error };
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
    .from(ITC_SIGNOFFS_TABLE)
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

  const submitResult = await retryItpItcWrite(
    "admin.itc_signoffs.submit",
    stripPayload({
      status: "submitted",
      submitted_at: submittedAt,
      signed_at: submittedAt,
      signed_by_worker_id: input.signedByWorkerId,
      updated_at: submittedAt,
      ...verifyPayload,
    }, ITC_SIGNOFF_COLUMNS),
    async (payload) => {
      const { error } = await admin
        .from(ITC_SIGNOFFS_TABLE)
        .update(payload)
        .eq("id", input.signoffId)
        .eq("status", "draft");
      return { error };
    }
  );

  if (submitResult.error) return { error: submitResult.error };

  const { data: signoffs, error: signoffsError } = await admin
    .from(ITC_SIGNOFFS_TABLE)
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

  const itcUpdate = await retryItpItcWrite(
    "admin.project_itcs.progress",
    stripPayload(
      {
        progress_percent: progress,
        status,
        updated_at: submittedAt,
        completed_at: status === "completed" || status === "complete" ? submittedAt : undefined,
      },
      PROJECT_ITC_COLUMNS,
      status === "completed" || status === "complete"
    ),
    async (payload) => {
      const { error } = await admin.from(PROJECT_ITCS_TABLE).update(payload).eq("id", input.itcId);
      return { error };
    }
  );

  if (itcUpdate.error) {
    return { error: itcUpdate.error };
  }

  return { error: null };
}
