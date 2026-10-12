export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { resolveRequestAuthUser } from "@/lib/auth-request-user";
import { profileApiJson } from "@/lib/profile-api-response";
import { linkWorkerProfile } from "@/lib/link-worker-profile";
import { emailsMatchExactly } from "@/lib/worker-auth-lookup";

async function resolveAuthenticatedUser(req: Request): Promise<User | null> {
  return resolveRequestAuthUser(req);
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return profileApiJson({ error: "Server configuration error." }, 500);
  }

  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    return profileApiJson({ error: "Not authenticated." }, 401);
  }

  const email = user.email?.trim() ?? "";
  if (!email) {
    return profileApiJson({ error: "Auth user email is required." }, 400);
  }

  const body = await req.json().catch(() => ({}));
  const bodyEmail =
    body && typeof body === "object" && typeof body.email === "string"
      ? body.email
      : "";
  const bodyAuthId =
    body && typeof body === "object" && typeof body.authId === "string"
      ? body.authId
      : "";

  if (bodyEmail && !emailsMatchExactly(bodyEmail, email)) {
    return profileApiJson(
      { error: "Email does not match the authenticated session." },
      403
    );
  }
  if (bodyAuthId && bodyAuthId.trim() !== user.id) {
    return profileApiJson(
      { error: "Auth id does not match the authenticated session." },
      403
    );
  }

  const result = await linkWorkerProfile(email, user.id);
  if (result.error || !result.workerId) {
    return profileApiJson(
      { error: result.error ?? "Worker profile not found." },
      400
    );
  }

  return profileApiJson({
    success: true,
    workerId: result.workerId,
    organisationId: result.organisationId,
    securityRole: result.securityRole,
    worker: result.worker,
  });
}
