import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import { getResetPasswordRedirectUrl } from "../src/lib/worker-auth-email";
import { MASTER_ADMIN_EMAIL } from "../src/lib/master-admin-config";

loadEnvLocal({ override: true });

async function main(): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) {
    console.error("FAIL: Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const supabase = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = MASTER_ADMIN_EMAIL;
  const redirectTo = getResetPasswordRedirectUrl();

  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    console.error("FAIL: Password setup email was not sent.");
    console.error("Email:", email);
    console.error("Redirect:", redirectTo);
    console.error("Error:", error.message);
    process.exit(1);
  }

  console.log("SUCCESS: Password setup email triggered.");
  console.log("Email:", email);
  console.log("Redirect:", redirectTo);
  console.log("Response:", JSON.stringify(data ?? {}, null, 2));
}

void main();
