/**
 * Master admin bootstrap CLI — restores platform owner access after deploy/reset.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import {
  MASTER_ADMIN_EMAIL,
  MASTER_ADMIN_ROLE,
} from "../src/lib/master-admin-config";
import { runMasterAdminSeed } from "../src/lib/master-admin-seed";

loadEnvLocal({ override: true });

export { MASTER_ADMIN_EMAIL, MASTER_ADMIN_ROLE } from "../src/lib/master-admin-config";
export { runMasterAdminSeed } from "../src/lib/master-admin-seed";

async function main(): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local before running seed:admin."
    );
  }

  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.");
  }

  try {
    const result = await runMasterAdminSeed();
    console.log("\nMaster admin seed complete.\n");
    console.log(`Email: ${result.email}`);
    console.log(`Role: ${MASTER_ADMIN_ROLE}`);
    console.log(`Auth user: ${result.authUserId}${result.createdAuthUser ? " (created)" : " (existing)"}`);
    console.log(`Worker: ${result.workerId}`);
    console.log("\nUse Supabase password reset or invite flow if a password is required.\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
