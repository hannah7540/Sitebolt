/**
 * Export induction form templates from Supabase into the standard seed file.
 *
 * Usage:
 *   npm run export:inductions
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Writes scripts/data/standard-induction-templates.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "../e2e/helpers/env";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import {
  SYSTEM_TEMPLATE_KEY_BY_TITLE,
  type StandardInductionTemplateSeed,
} from "./lib/standard-induction-seed";

loadEnvLocal({ override: true });

function slugifyTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveSystemTemplateKey(title: string): string {
  return SYSTEM_TEMPLATE_KEY_BY_TITLE[title] ?? slugifyTitle(title);
}

async function main(): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    console.error("FAIL: SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.");
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("induction_form_templates")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    console.error("FAIL: No induction_form_templates rows found.");
    process.exit(1);
  }

  const templates: StandardInductionTemplateSeed[] = rows.map((row) => {
    const title = String(row.title ?? "Untitled Induction");
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    const logicRules = Array.isArray(row.logic_rules) ? row.logic_rules : [];

    return {
      id: String(row.id),
      system_template_key: resolveSystemTemplateKey(title),
      title,
      description: row.description ? String(row.description) : null,
      form_type: "Induction" as const,
      scope: row.scope === "project" ? "project" : "company",
      scope_type:
        row.scope_type === "project" || row.scope === "project" ? "project" : "company",
      project_id: row.project_id ? String(row.project_id) : null,
      project_name: row.project_name ? String(row.project_name) : null,
      company_logo_url: row.company_logo_url ? String(row.company_logo_url) : null,
      status: row.status === "active" ? "active" : "draft",
      is_active: row.is_active !== false && row.status === "active",
      blocks,
      schema_fields: Array.isArray(row.schema_fields) ? row.schema_fields : blocks,
      logic_rules: logicRules,
      copied_from_id: row.copied_from_id ? String(row.copied_from_id) : null,
      category: row.category ? String(row.category) : null,
    };
  });

  const outDir = path.resolve(process.cwd(), "scripts/data");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "standard-induction-templates.json");
  writeFileSync(
    outPath,
    `${JSON.stringify({ version: 1, exported_at: new Date().toISOString(), templates }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Exported ${templates.length} induction template(s) to ${outPath}`);
  for (const template of templates) {
    console.log(`  · ${template.system_template_key} — ${template.title}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
