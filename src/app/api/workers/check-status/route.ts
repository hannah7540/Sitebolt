export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { markWorkerAccountActivated } from "@/lib/ensure-worker-profile";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import {
  resolvePostPasswordSetupHref,
  type WorkerPostPasswordStatus,
} from "@/lib/post-password-redirect";

const WORKER_STATUS_SELECT =
  "id, onboarding_completed, status, invite_status, auth_user_id, email";

async function resolveAuthenticatedUser(req: Request): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) {
      return data.user;
    }
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return user;
}

async function findWorkerForUser(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: User
): Promise<WorkerPostPasswordStatus | null> {
  const email = user.email?.trim() ?? "";

  if (user.id) {
    const byAuth = await admin
      .from("workers")
      .select(WORKER_STATUS_SELECT)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!byAuth.error && byAuth.data) {
      return normalizeWorker(byAuth.data);
    }
  }

  if (email) {
    const byEmail = await admin
      .from("workers")
      .select(WORKER_STATUS_SELECT)
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (!byEmail.error && byEmail.data) {
      return normalizeWorker(byEmail.data);
    }
  }

  return null;
}

function normalizeWorker(row: {
  id?: unknown;
  onboarding_completed?: unknown;
  status?: unknown;
  invite_status?: unknown;
}): WorkerPostPasswordStatus | null {
  if (typeof row.id !== "string" || !row.id) {
    return null;
  }

  return {
    id: row.id,
    onboarding_completed:
      typeof row.onboarding_completed === "boolean"
        ? row.onboarding_completed
        : null,
    status: typeof row.status === "string" ? row.status : null,
    invite_status:
      typeof row.invite_status === "string" ? row.invite_status : null,
  };
}

export async function GET(req: Request) {
  return handleCheckStatus(req);
}

export async function POST(req: Request) {
  return handleCheckStatus(req);
}

async function handleCheckStatus(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Supabase service role is not configured." },
      { status: 500 }
    );
  }

  try {
    const user = await resolveAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    let worker = await findWorkerForUser(admin, user);

    if (worker) {
      const email = user.email?.trim() ?? "";
      await linkWorkerAuthAccount(admin, {
        workerId: worker.id,
        authUserId: user.id,
        email: email || worker.id,
        fullName: email.split("@")[0] || "Worker",
      });
      await markWorkerAccountActivated(admin, worker.id, {
        completeOnboarding: worker.onboarding_completed === true,
        acceptInvite: true,
      });
      worker = await findWorkerForUser(admin, user);
    }

    return NextResponse.json({
      worker,
      redirectTo: resolvePostPasswordSetupHref(worker),
    });
  } catch (cause) {
    return NextResponse.json(
      {
        error:
          cause instanceof Error
            ? cause.message
            : "Failed to check worker status.",
      },
      { status: 500 }
    );
  }
}
