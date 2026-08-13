/**
 * Production go-live cleanup — wipes operational test data for day-one onboarding.
 *
 * Preserves:
 *   - Primary owner (hannah@site-bolt.com.au)
 *   - 4 system induction templates
 *   - pay_rates_and_rules, pay_rule_templates, pay_rule_conditions
 *   - company_profile, expiry_alert_settings, organisational defaults
 *
 * Usage:
 *   npm run db:go-live -- --dry-run     Preview only
 *   npm run db:go-live -- --confirm     Execute cleanup (required)
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import { MASTER_ADMIN_EMAIL } from "../src/lib/master-admin-config";
import { runProductionGoLiveCleanup } from "../src/lib/production-go-live-cleanup";

loadEnvLocal({ override: true });

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const confirmed = process.argv.includes("--confirm");

  if (!dryRun && !confirmed) {
    console.error("\nProduction go-live cleanup requires --confirm (or use --dry-run to preview).\n");
    console.error("  npm run db:go-live -- --dry-run");
    console.error("  npm run db:go-live -- --confirm\n");
    process.exit(1);
  }

  const env = getSupabaseEnv();
  if (!env) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  if (!isSupabaseAdminConfigured()) {
    console.error("FAIL: SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.");
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();

  console.log("\nSiteBolt production go-live cleanup\n");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE DELETE"}`);
  console.log(`Owner preserved: ${MASTER_ADMIN_EMAIL}\n`);

  const summary = await runProductionGoLiveCleanup({
    supabase: admin,
    admin,
    dryRun,
  });

  console.log("\n--- Summary ---\n");
  console.log(`Owner worker: ${summary.ownerWorkerId ?? "not found"}`);
  console.log(`Owner auth:   ${summary.ownerAuthUserId ?? "not found"}`);
  if (!dryRun) {
    console.log(`Workers removed:     ${summary.workersRemoved}`);
    console.log(`Auth users removed:  ${summary.authUsersRemoved}`);
    console.log(`Projects removed:    ${summary.projectsRemoved}`);
    console.log(`Tables cleared:      ${summary.tablesCleared.length}`);
    console.log(`Induction templates: ${summary.inductionTemplatesKept} system kept`);
    console.log(`Pay rules kept:      ${summary.payRulesKept}`);
    console.log(`Pay rule templates:  ${summary.payRuleTemplatesKept}`);
    console.log(`Sanity check:        ${summary.sanityCheckPassed ? "PASSED" : "NEEDS REVIEW"}`);
  }

  if (summary.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const message of summary.warnings) {
      console.log(`  · ${message}`);
    }
  }

  if (!dryRun && !summary.sanityCheckPassed) {
    process.exit(1);
  }

  console.log("\nGo-live cleanup complete.\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
