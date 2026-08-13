import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  InductionFormBlock,
  InductionFormLogicRule,
} from "../../src/lib/induction-form-builder";

export const SYSTEM_TEMPLATE_KEY_BY_TITLE: Record<string, string> = {
  "Test Project Induction": "test-project-induction",
  "NSW Company Induction": "nsw-company-induction",
  "ACT Company Induction": "act-company-induction",
  "WA Company Induction": "wa-company-induction",
};

export interface StandardInductionTemplateSeed {
  id: string;
  system_template_key: string;
  title: string;
  description: string | null;
  form_type: "Induction";
  scope: "company" | "project";
  scope_type: "company" | "project";
  project_id: string | null;
  project_name: string | null;
  company_logo_url: string | null;
  status: "active" | "draft";
  is_active: boolean;
  blocks: InductionFormBlock[];
  schema_fields: InductionFormBlock[];
  logic_rules: InductionFormLogicRule[];
  copied_from_id: string | null;
  category?: string | null;
}

interface StandardInductionSeedFile {
  version: number;
  exported_at?: string;
  templates: StandardInductionTemplateSeed[];
}

const SEED_FILE_PATH = path.resolve(
  process.cwd(),
  "scripts/data/standard-induction-templates.json"
);

export function loadStandardInductionTemplates(): StandardInductionTemplateSeed[] {
  if (!existsSync(SEED_FILE_PATH)) {
    throw new Error(
      `Missing seed file at ${SEED_FILE_PATH}. Run npm run export:inductions first.`
    );
  }

  const raw = readFileSync(SEED_FILE_PATH, "utf8");
  const parsed = JSON.parse(raw) as StandardInductionTemplateSeed[] | StandardInductionSeedFile;
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (parsed && Array.isArray(parsed.templates)) {
    return parsed.templates;
  }
  throw new Error(`Invalid induction seed file format: ${SEED_FILE_PATH}`);
}

function buildUpsertRow(
  template: StandardInductionTemplateSeed,
  options?: { includeSystemColumns?: boolean }
): Record<string, unknown> {
  const now = new Date().toISOString();
  const blocks = template.blocks ?? template.schema_fields ?? [];
  const includeSystemColumns = options?.includeSystemColumns !== false;

  const row: Record<string, unknown> = {
    id: template.id,
    title: template.title,
    description: template.description,
    form_type: template.form_type,
    scope: template.scope,
    scope_type: template.scope_type ?? template.scope,
    project_id: template.scope === "project" ? template.project_id : null,
    project_name: template.project_name,
    company_logo_url: template.company_logo_url,
    status: template.status,
    is_active: template.is_active,
    blocks,
    schema_fields: template.schema_fields ?? blocks,
    logic_rules: template.logic_rules ?? [],
    copied_from_id: template.copied_from_id,
    updated_at: now,
  };

  if (includeSystemColumns) {
    row.system_template_key = template.system_template_key;
    row.is_system_template = true;
  }

  return row;
}

function isMissingSystemColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("is_system_template") ||
    lower.includes("system_template_key") ||
    lower.includes("schema cache")
  );
}

async function persistTemplate(
  supabase: SupabaseClient,
  template: StandardInductionTemplateSeed,
  existingId: string | null,
  includeSystemColumns: boolean
): Promise<{ error: string | null }> {
  const payload = buildUpsertRow(template, { includeSystemColumns });

  if (existingId) {
    let { error } = await supabase
      .from("induction_form_templates")
      .update(payload)
      .eq("id", existingId);

    if (error?.message.includes("project_id_fkey")) {
      ({ error } = await supabase
        .from("induction_form_templates")
        .update({
          ...payload,
          project_id: null,
          project_name: null,
          scope: "company",
          scope_type: "company",
        })
        .eq("id", existingId));
    }

    return { error: error?.message ?? null };
  }

  let { error } = await supabase.from("induction_form_templates").insert([
    {
      ...payload,
      created_at: new Date().toISOString(),
    },
  ]);

  if (error?.message.includes("project_id_fkey")) {
    ({ error } = await supabase.from("induction_form_templates").insert([
      {
        ...payload,
        project_id: null,
        project_name: null,
        scope: "company",
        scope_type: "company",
        created_at: new Date().toISOString(),
      },
    ]));
  }

  return { error: error?.message ?? null };
}

export async function seedStandardInductionTemplates(
  supabase: SupabaseClient,
  options?: { restoreContent?: boolean; verbose?: boolean }
): Promise<{ inserted: number; updated: number; errors: string[]; warnings: string[] }> {
  const templates = loadStandardInductionTemplates();
  const restoreContent = options?.restoreContent !== false;
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const template of templates) {
    const key = template.system_template_key;
    let existingId: string | null = null;

    const { data: existingByKey, error: lookupError } = await supabase
      .from("induction_form_templates")
      .select("id, system_template_key")
      .eq("system_template_key", key)
      .maybeSingle();

    if (lookupError?.message.includes("system_template_key")) {
      const { data: existingById } = await supabase
        .from("induction_form_templates")
        .select("id")
        .eq("id", template.id)
        .maybeSingle();
      existingId = existingById?.id ? String(existingById.id) : null;
    } else if (lookupError) {
      errors.push(`${key}: lookup failed — ${lookupError.message}`);
      continue;
    } else {
      existingId = existingByKey?.id ? String(existingByKey.id) : null;
    }

    if (!existingId) {
      const { data: existingById } = await supabase
        .from("induction_form_templates")
        .select("id")
        .eq("id", template.id)
        .maybeSingle();
      existingId = existingById?.id ? String(existingById.id) : null;
    }

    if (existingId && !restoreContent) {
      if (options?.verbose) {
        console.log(`  kept ${key} (${template.title})`);
      }
      continue;
    }

    if (existingId) {
      let persistError = (
        await persistTemplate(supabase, template, existingId, true)
      ).error;
      if (persistError && isMissingSystemColumnError(persistError)) {
        persistError = (await persistTemplate(supabase, template, existingId, false)).error;
      }
      if (persistError) {
        errors.push(`${key}: update failed — ${persistError}`);
      } else {
        updated += 1;
        if (options?.verbose) {
          console.log(`  updated ${key} (${template.title})`);
        }
      }
      continue;
    }

    let persistError = (await persistTemplate(supabase, template, null, true)).error;
    if (persistError && isMissingSystemColumnError(persistError)) {
      persistError = (await persistTemplate(supabase, template, null, false)).error;
    }

    if (persistError) {
      errors.push(`${key}: insert failed — ${persistError}`);
    } else {
      inserted += 1;
      if (options?.verbose) {
        console.log(`  inserted ${key} (${template.title})`);
      }
    }
  }

  if (errors.length === 0) {
    const { error: probeError } = await supabase
      .from("induction_form_templates")
      .select("is_system_template")
      .limit(1);
    if (probeError?.message.includes("is_system_template")) {
      warnings.push(
        "Migration 105_induction_system_templates.sql is not applied. Run it in Supabase, then re-run seed:inductions to mark templates as system templates."
      );
    }
  }

  return { inserted, updated, errors, warnings };
}

export async function deleteNonSystemInductionTemplates(
  supabase: SupabaseClient
): Promise<{ deleted: number; error: string | null }> {
  const systemKeys = loadStandardInductionTemplates().map((row) => row.system_template_key);

  const { data: customRows, error: selectError } = await supabase
    .from("induction_form_templates")
    .select("id, system_template_key, is_system_template")
    .or("is_system_template.eq.false,is_system_template.is.null");

  if (selectError) {
    if (selectError.message.includes("is_system_template")) {
      const { data: fallbackRows, error: fallbackError } = await supabase
        .from("induction_form_templates")
        .select("id, system_template_key");

      if (fallbackError) {
        return { deleted: 0, error: fallbackError.message };
      }

      const idsToDelete = (fallbackRows ?? [])
        .filter((row) => {
          const key = row.system_template_key ? String(row.system_template_key) : "";
          return !key || !systemKeys.includes(key);
        })
        .map((row) => String(row.id));

      if (idsToDelete.length === 0) {
        return { deleted: 0, error: null };
      }

      const { error } = await supabase
        .from("induction_form_templates")
        .delete()
        .in("id", idsToDelete);
      return { deleted: idsToDelete.length, error: error?.message ?? null };
    }

    return { deleted: 0, error: selectError.message };
  }

  const idsToDelete = (customRows ?? [])
    .filter((row) => {
      const key = row.system_template_key ? String(row.system_template_key) : "";
      return !row.is_system_template && (!key || !systemKeys.includes(key));
    })
    .map((row) => String(row.id));

  if (idsToDelete.length === 0) {
    return { deleted: 0, error: null };
  }

  const { error } = await supabase.from("induction_form_templates").delete().in("id", idsToDelete);
  return { deleted: idsToDelete.length, error: error?.message ?? null };
}
