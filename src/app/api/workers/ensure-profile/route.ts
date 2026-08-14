export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ensureWorkerProfileForAuthUser,
  markWorkerAccountActivated,
  syncWorkerStatusFromAuthUser,
  workerAuthIsActivated,
} from "@/lib/ensure-worker-profile";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const passwordAccepted = Boolean(
    body && typeof body === "object" && "passwordAccepted" in body && body.passwordAccepted
  );

  const admin = createSupabaseAdminClient();
  const { workerId, error } = await ensureWorkerProfileForAuthUser(admin, user);

  if (error || !workerId) {
    return NextResponse.json(
      { error: error ?? "Failed to create worker profile." },
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

  return NextResponse.json({ success: true, workerId, status: "active" });
}
