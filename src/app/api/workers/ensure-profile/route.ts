export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureWorkerProfileForAuthUser,
  markWorkerAccountActivated,
  syncWorkerStatusFromAuthUser,
  workerAuthIsActivated,
} from "@/lib/ensure-worker-profile";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { resolveRequestAuthUser } from "@/lib/auth-request-user";
import { profileApiJson } from "@/lib/profile-api-response";

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

  const body = await req.json().catch(() => ({}));
  const passwordAccepted = Boolean(
    body && typeof body === "object" && "passwordAccepted" in body && body.passwordAccepted
  );

  const admin = createSupabaseAdminClient();
  const { workerId, organisationId, worker, error } = await ensureWorkerProfileForAuthUser(
    admin,
    user
  );

  if (error || !workerId) {
    return profileApiJson({ error: error ?? "Worker profile not found." }, 400);
  }

  if (passwordAccepted || workerAuthIsActivated(user)) {
    await markWorkerAccountActivated(admin, workerId, {
      completeOnboarding: false,
    });
  } else {
    await syncWorkerStatusFromAuthUser(admin, user, workerId);
  }

  return profileApiJson({
    success: true,
    workerId,
    organisationId,
    status: "active",
    worker,
  });
}
