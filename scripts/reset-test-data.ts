/**
 * Wipe operational / test data while preserving and re-seeding standard induction templates.
 *
 * Usage:
 *   npm run db:reset
 *   npm run db:reset -- --keep-induction-edits   (re-seed missing system templates only)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import { runDashboardCalendarSeed, SEED_TAG as DASHBOARD_SEED_TAG } from "./seed-dashboard-and-calendars";
import { runPayrollTestSeed, SEED_TAG as PAYROLL_SEED_TAG } from "./seed-payroll-test-week";
import {
  deleteNonSystemInductionTemplates,
  seedStandardInductionTemplates,
} from "./lib/standard-induction-seed";

loadEnvLocal({ override: true });

async function deleteAllInductionAssignments(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<void> {
  const { error } = await admin
    .from("form_worker_assignments")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.warn("form_worker_assignments cleanup:", error.message);
  } else {
    console.log("  cleared worker induction assignments");
  }
}

async function deleteSeedTaggedSiteForms(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<void> {
  for (const tag of [DASHBOARD_SEED_TAG, PAYROLL_SEED_TAG]) {
    const { error } = await admin
      .from("site_forms")
      .delete()
      .contains("form_data", { seed_tag: tag });
    if (error) {
      console.warn(`site_forms cleanup (${tag}):`, error.message);
    }
  }

  const { error: notesError } = await admin
    .from("site_forms")
    .delete()
    .or(`notes.ilike.%${DASHBOARD_SEED_TAG}%,notes.ilike.%${PAYROLL_SEED_TAG}%`);
  if (notesError) {
    console.warn("site_forms notes cleanup:", notesError.message);
  } else {
    console.log("  cleared seed-tagged site forms (safety walks, toolbox talks, pre-starts)");
  }
}

async function main(): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  if (!isSupabaseAdminConfigured()) {
    console.error("FAIL: SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.");
    process.exit(1);
  }

  const keepInductionEdits = process.argv.includes("--keep-induction-edits");
  const anonClient = createClient(env.url, env.anonKey);
  const admin = createSupabaseAdminClient();

  console.log("\nSiteBolt test data reset\n");

  console.log("1/5 Removing dashboard & calendar seed data…");
  await runDashboardCalendarSeed({ supabase: anonClient, cleanup: true });

  console.log("2/5 Removing payroll test seed data…");
  await runPayrollTestSeed({ supabase: anonClient, cleanup: true });

  console.log("3/5 Clearing induction worker sign-offs…");
  await deleteAllInductionAssignments(admin);

  console.log("4/5 Clearing seed-tagged operational site forms…");
  await deleteSeedTaggedSiteForms(admin);

  console.log("5/5 Resetting induction template library…");
  const customResult = await deleteNonSystemInductionTemplates(admin);
  if (customResult.error) {
    console.warn("  custom template cleanup:", customResult.error);
  } else {
    console.log(`  removed ${customResult.deleted} custom induction template(s)`);
  }

  const seedResult = await seedStandardInductionTemplates(admin, {
    restoreContent: !keepInductionEdits,
    verbose: true,
  });

  if (seedResult.errors.length > 0) {
    console.error("\nInduction seed errors:");
    for (const message of seedResult.errors) {
      console.error(`  · ${message}`);
    }
    process.exit(1);
  }

  if (seedResult.warnings.length > 0) {
    console.warn("\nWarnings:");
    for (const message of seedResult.warnings) {
      console.warn(`  · ${message}`);
    }
  }

  console.log(
    `\nReset complete — ${seedResult.inserted} induction template(s) inserted, ${seedResult.updated} updated.`
  );
  if (keepInductionEdits) {
    console.log("System induction content was left unchanged (--keep-induction-edits).");
  } else {
    console.log("Standard induction templates restored from seed file.");
  }
  console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
