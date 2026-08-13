/**
 * Set master admin password directly via Supabase Auth Admin API.
 *
 * Usage:
 *   npx tsx scripts/set-master-admin-password.ts
 *
 * Optional in .env.local:
 *   MASTER_ADMIN_EMAIL=hannah@site-bolt.com.au
 *   MASTER_ADMIN_PASSWORD=your-password-here
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { loadEnvLocal } from "../e2e/helpers/env";
import { createSupabaseAdminClient } from "../src/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "../src/lib/supabase/env";
import { MASTER_ADMIN_EMAIL } from "../src/lib/master-admin-config";
import type { User } from "@supabase/supabase-js";

loadEnvLocal({ override: true });

const DEFAULT_DEV_PASSWORD = "SiteBolt-Owner-2026!";
const LOGIN_URL = "http://localhost:3000/login";

async function findAuthUserByEmail(
  email: string
): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );
    if (match) return match;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function main(): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    console.error("FAIL: SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.");
    process.exit(1);
  }

  const password = process.env.MASTER_ADMIN_PASSWORD?.trim() || DEFAULT_DEV_PASSWORD;
  const passwordSource = process.env.MASTER_ADMIN_PASSWORD?.trim()
    ? "MASTER_ADMIN_PASSWORD (.env.local)"
    : "built-in dev default";

  console.log(`Looking up auth user: ${MASTER_ADMIN_EMAIL}`);

  const user = await findAuthUserByEmail(MASTER_ADMIN_EMAIL);
  if (!user) {
    console.error("FAIL: Auth user not found.");
    console.error(`Run npm run seed:admin first to create ${MASTER_ADMIN_EMAIL}.`);
    process.exit(1);
  }

  console.log(`Found user ID: ${user.id}`);

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("FAIL: Could not update master admin password.");
    console.error("User ID:", user.id);
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log("\nSUCCESS: Master admin password updated.\n");
  console.log("Email:", MASTER_ADMIN_EMAIL);
  console.log("User ID:", data.user.id);
  console.log("Password source:", passwordSource);
  console.log("Password:", password);
  console.log("Login URL:", LOGIN_URL);
  console.log("\nYou can sign in immediately at the login URL above.\n");
}

void main();
