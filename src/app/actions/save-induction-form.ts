"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import {
  formatInductionFormSaveError,
  INDUCTION_FORM_TEMPLATES_TABLE,
  normalizeForm,
  sanitizeInductionFormSavePayload,
  type InductionFormSaveInput,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import { canManageAdministration, normalizeSecurityRole } from "@/lib/security-roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isOrganisationColumnMissing,
  shouldStripOrganisationIdOnWrite,
  withOrganisationScope,
} from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";

const OPTIONAL_INDUCTION_FORM_DB_COLUMNS = [
  "schema_fields",
  "logic_rules",
  "scope_type",
  "project_name",
  "company_logo_url",
  "is_active",
] as const;

function validateInductionFormInput(
  input: InductionFormSaveInput
): string | null {
  const title = input.title?.trim() ?? "";
  if (!title) return "Title is required.";
  if (input.scope !== "company" && input.scope !== "project") {
    return "Scope must be company or project.";
  }
  if (input.scope === "project" && !input.project_id?.trim()) {
    return "Select a project for project-specific inductions.";
  }
  if (input.status !== "active" && input.status !== "draft") {
    return "Status must be active or draft.";
  }
  return null;
}

async function persistInductionTemplate(
  admin: SupabaseClient,
  orgId: string,
  input: InductionFormSaveInput
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const payload = sanitizeInductionFormSavePayload(input, {
    organisationId: orgId,
  });
  let current: Record<string, unknown> = {
    ...payload,
    organisation_id: orgId,
  };

  for (let attempt = 0; attempt < 16; attempt += 1) {
    current.organisation_id = orgId;

    const result = input.id
      ? await withOrganisationScope(
          admin
            .from(INDUCTION_FORM_TEMPLATES_TABLE)
            .update(current)
            .eq("id", input.id),
          orgId
        )
          .select("*")
          .single()
      : await admin
          .from(INDUCTION_FORM_TEMPLATES_TABLE)
          .insert([{ ...current, organisation_id: orgId }])
          .select("*")
          .single();

    if (!result.error && result.data) {
      return { data: result.data as Record<string, unknown>, error: null };
    }

    if (!result.error) {
      return {
        data: null,
        error: { message: input.id ? "Update failed" : "Create failed" },
      };
    }

    if (
      isOrganisationColumnMissing(result.error.message) &&
      "organisation_id" in current
    ) {
      if (!shouldStripOrganisationIdOnWrite(result.error.message, orgId)) {
        return { data: null, error: result.error };
      }
      current = stripMissingColumn(current, "organisation_id");
      continue;
    }

    const missing = parseMissingColumnFromError(result.error.message);
    if (
      missing &&
      missing !== "organisation_id" &&
      missing in current &&
      (OPTIONAL_INDUCTION_FORM_DB_COLUMNS as readonly string[]).includes(missing)
    ) {
      current = stripMissingColumn(current, missing);
      continue;
    }

    return { data: null, error: result.error };
  }

  return { data: null, error: { message: "Save failed after column fallback." } };
}

export async function saveInductionFormAction(
  input: InductionFormSaveInput
): Promise<{ error: string | null; form?: InductionFormTemplate }> {
  const operation = input.id ? "update" : "create";

  try {
    const validationError = validateInductionFormInput(input);
    if (validationError) {
      return { error: validationError };
    }

    if (!isSupabaseAdminConfigured()) {
      return { error: "Server admin client is not configured." };
    }

    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return { error: "Active organisation is required." };
    }

    const session = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await session.auth.getUser();
    if (authError) {
      return { error: authError.message };
    }
    if (!user) {
      return { error: "Not authenticated." };
    }

    const admin = createSupabaseAdminClient();
    let actorRow: { security_role?: string } | null = null;
    const authLookup = await admin
      .from("workers")
      .select("id, security_role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!authLookup.error && authLookup.data) {
      actorRow = authLookup.data as { security_role?: string };
    } else if (user.email) {
      const emailLookup = await admin
        .from("workers")
        .select("id, security_role")
        .ilike("email", user.email)
        .maybeSingle();
      actorRow = (emailLookup.data as { security_role?: string } | null) ?? null;
    }

    const role = normalizeSecurityRole(actorRow?.security_role);
    if (!canManageAdministration(role)) {
      return { error: "Forbidden." };
    }

    const { data, error } = await persistInductionTemplate(admin, orgId, input);
    if (error || !data) {
      return {
        error: error
          ? formatInductionFormSaveError(operation, error)
          : input.id
            ? "Update failed"
            : "Create failed",
      };
    }

    revalidatePath("/admin/forms/inductions");
    if (input.id) {
      revalidatePath(`/admin/forms/inductions/${input.id}/edit`);
    } else {
      revalidatePath("/admin/forms/inductions/new");
    }

    return { error: null, form: normalizeForm(data) };
  } catch (cause) {
    return { error: formatInductionFormSaveError(operation, cause) };
  }
}

export async function duplicateInductionFormAction(
  formId: string
): Promise<{ error: string | null; form?: InductionFormTemplate }> {
  const id = formId.trim();
  if (!id) return { error: "Form not found." };

  try {
    if (!isSupabaseAdminConfigured()) {
      return { error: "Server admin client is not configured." };
    }

    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return { error: "Active organisation is required." };
    }

    const session = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await session.auth.getUser();
    if (authError) return { error: authError.message };
    if (!user) return { error: "Not authenticated." };

    const admin = createSupabaseAdminClient();
    let actorRow: { security_role?: string } | null = null;
    const authLookup = await admin
      .from("workers")
      .select("id, security_role")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!authLookup.error && authLookup.data) {
      actorRow = authLookup.data as { security_role?: string };
    } else if (user.email) {
      const emailLookup = await admin
        .from("workers")
        .select("id, security_role")
        .ilike("email", user.email)
        .maybeSingle();
      actorRow = (emailLookup.data as { security_role?: string } | null) ?? null;
    }
    const role = normalizeSecurityRole(actorRow?.security_role);
    if (!canManageAdministration(role)) {
      return { error: "Forbidden." };
    }

    let query = admin
      .from(INDUCTION_FORM_TEMPLATES_TABLE)
      .select("*")
      .eq("id", id);
    query = withOrganisationScope(query, orgId);
    const { data, error } = await query.maybeSingle();
    if (error) return { error: error.message };
    if (!data) return { error: "Form not found." };

    const source = normalizeForm(data as Record<string, unknown>);
    return saveInductionFormAction({
      title: `${source.title} (Copy)`,
      description: source.description,
      scope: source.scope,
      project_id: source.project_id,
      status: "draft",
      blocks: source.blocks,
      schema_fields: source.schema_fields,
      logic_rules: source.logic_rules,
      copied_from_id: source.id,
      is_active: false,
    });
  } catch (cause) {
    return { error: formatInductionFormSaveError("create", cause) };
  }
}
