/**
 * Live ITP/ITC schema dump for reconciliation.
 * Prints public columns for every ITP/ITC-related table.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TABLES = [
  "project_itps",
  "project_itp_items",
  "itp_checklist_items",
  "itp_templates",
  "itp_signoffs",
  "itp_attachments",
  "project_itcs",
  "project_itc_items",
  "itc_checklist_items",
  "itc_checklist_entries",
  "itc_templates",
  "itc_signoffs",
  "itc_attachments",
  "itc_photos",
  "itc_step_photos",
  "itc_zones",
  "itc_form_steps",
  "itc_signoff_edits",
  "itc_change_requests",
  "itc_compaction_tests",
  "itc_compaction_test_links",
  "itc_project_drawings",
  "itc_service_spec_rules",
  "itc_drawing_pins",
  "itc_batch_items",
  "itc_inspection_activities",
  "itc_master_specs",
  "project_itc_plans",
  "itcs",
  "signoffs",
];

function loadEnvFiles(): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = path.join(ROOT, name);
    if (!existsSync(envPath)) continue;
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value.replace(/\r/g, "").trim();
    }
  }
}

function envValue(...keys: string[]): string {
  for (const key of keys) {
    const value = (process.env[key] ?? "").replace(/\r/g, "").trim().replace(/^['"]|['"]$/g, "");
    if (value) return value;
  }
  return "";
}

async function main(): Promise<void> {
  loadEnvFiles();
  const url = envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const key = envValue(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "SUPABASE_SECRET_KEY",
    "SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_ANON_KEY"
  );
  if (!url || !key) throw new Error("Missing Supabase URL/key");

  const response = await fetch(new URL("/rest/v1/", url), {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/openapi+json",
    },
  });
  if (!response.ok) {
    throw new Error(`OpenAPI fetch failed: ${response.status} ${await response.text()}`);
  }
  const spec = (await response.json()) as {
    definitions?: Record<string, { properties?: Record<string, { type?: string; format?: string }>; required?: string[] }>;
    components?: {
      schemas?: Record<string, { properties?: Record<string, { type?: string; format?: string }>; required?: string[] }>;
    };
  };
  const schemas = spec.definitions ?? spec.components?.schemas ?? {};
  const byTable = new Map<string, string[]>();
  for (const [name, schema] of Object.entries(schemas)) {
    if (!TABLES.includes(name)) continue;
    const required = new Set(schema.required ?? []);
    const list: string[] = [];
    for (const [column, def] of Object.entries(schema.properties ?? {})) {
      list.push(`${column} ${def.format ?? def.type ?? "unknown"}${required.has(column) ? " NOT NULL" : ""}`);
    }
    byTable.set(name, list);
  }

  for (const table of TABLES) {
    const cols = (byTable.get(table) ?? []).sort();
    if (cols.length === 0) {
      console.log(`\n=== ${table} === MISSING TABLE`);
      continue;
    }
    console.log(`\n=== ${table} (${cols.length} columns) ===`);
    for (const col of cols) console.log(`  ${col}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
