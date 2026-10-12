export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureWorkerProfileForAuthUser,
  markWorkerAccountActivated,
  syncWorkerStatusFromAuthUser,
  workerAuthIsActivated,
} from "@/lib/ensure-worker-profile";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

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

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const user = await resolveAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const passwordAccepted = Boolean(
    body && typeof body === "object" && "passwordAccepted" in body && body.passwordAccepted
  );

  const admin = createSupabaseAdminClient();
  const { workerId, organisationId, error } = await ensureWorkerProfileForAuthUser(admin, user);

  if (error || !workerId) {
    return NextResponse.json(
      { error: error ?? "Worker profile not found." },
      { status: 400 }
    );
  }

  if (passwordAccepted || workerAuthIsActivated(user)) {
    await markWorkerAccountActivated(admin, workerId, {
      completeOnboarding: false,
    });
  } else {
    await syncWorkerStatusFromAuthUser(admin, user, workerId);
  }

  return NextResponse.json({
    success: true,
    workerId,
    organisationId,
    status: "active",
  });
}
