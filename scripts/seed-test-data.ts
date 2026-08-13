/**
 * CLI wrapper for comprehensive test-data seeding.
 *
 * Usage:
 *   npm run seed:test-data
 *   npm run seed:test-data -- --cleanup
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local for auth-linked users.
 * Does NOT modify standard system induction templates.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import {
  cleanupComprehensiveTestSeed,
  runComprehensiveTestSeed,
  SEED_TAG,
} from "../src/lib/seed-test-data";

loadEnvLocal({ override: true });

async function main(): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  const cleanup = process.argv.includes("--cleanup");
  const supabase = createClient(env.url, env.anonKey);
  const admin = isSupabaseAdminConfigured() ? createSupabaseAdminClient() : null;

  if (!admin && !cleanup) {
    console.warn(
      "WARN: SUPABASE_SERVICE_ROLE_KEY not set — workers will be created without auth users/profiles."
    );
  }

  try {
    if (cleanup) {
      await cleanupComprehensiveTestSeed(supabase);
      console.log(`\nCleanup complete for tag: ${SEED_TAG}\n`);
      return;
    }

    console.log(`\nSeeding comprehensive test data (${SEED_TAG})…\n`);
    const summary = await runComprehensiveTestSeed({ supabase, admin });

    console.log("Seed complete.\n");
    console.log(`Tag: ${SEED_TAG}`);
    console.log(`Workers: ${summary.workers}`);
    console.log(`Projects: ${summary.projects}`);
    console.log(`Plant assets: ${summary.plant}`);
    console.log(`Plant pre-starts: ${summary.plantPrestarts}`);
    console.log(`Site forms (walks, toolbox, daily): ${summary.siteForms}`);
    console.log(`SWMS documents: ${summary.swmsDocuments} · assignments: ${summary.swmsAssignments}`);
    console.log(`Induction assignments: ${summary.inductionAssignments}`);
    console.log(`Timesheets: ${summary.timesheets}`);
    console.log(`ACT workers: ${summary.actWorkers} · WA workers: ${summary.waWorkers}`);
    console.log(`Regional timesheets (ACT/WA): ${summary.regionalTimesheets}`);
    console.log(`Leave requests: ${summary.leaveRequests}`);
    console.log("\nOpen Project Dashboard, Inductions, Accounts → Timesheets, and Safety modules to review.\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
