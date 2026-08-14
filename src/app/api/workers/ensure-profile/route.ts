export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureWorkerProfileForAuthUser } from "@/lib/ensure-worker-profile";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export async function POST() {
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

  const admin = createSupabaseAdminClient();
  const { workerId, error } = await ensureWorkerProfileForAuthUser(admin, user);

  if (error || !workerId) {
    return NextResponse.json(
      { error: error ?? "Failed to create worker profile." },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true, workerId });
}
