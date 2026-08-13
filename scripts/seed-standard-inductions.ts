/**
 * Seed standard system induction templates from scripts/data/standard-induction-templates.json
 *
 * Usage:
 *   npm run seed:inductions
 *   npm run seed:inductions -- --ensure-only   (insert missing only; do not overwrite content)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { loadEnvLocal } from "../e2e/helpers/env";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import { seedStandardInductionTemplates } from "./lib/standard-induction-seed";

loadEnvLocal({ override: true });

async function main(): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    console.error("FAIL: SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.");
    process.exit(1);
  }

  const ensureOnly = process.argv.includes("--ensure-only");
  const admin = createSupabaseAdminClient();

  console.log(
    ensureOnly
      ? "Ensuring standard induction templates exist (no content overwrite)…"
      : "Seeding standard induction templates…"
  );

  const result = await seedStandardInductionTemplates(admin, {
    restoreContent: !ensureOnly,
    verbose: true,
  });

  if (result.errors.length > 0) {
    console.error("\nErrors:");
    for (const message of result.errors) {
      console.error(`  · ${message}`);
    }
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    console.warn("\nWarnings:");
    for (const message of result.warnings) {
      console.warn(`  · ${message}`);
    }
  }

  console.log(
    `\nDone — ${result.inserted} inserted, ${result.updated} updated.\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
