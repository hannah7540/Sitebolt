export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { completeWorkerItcAdmin } from "@/lib/worker-itc-admin-mutations";

export async function POST(
  request: Request,
  context: { params: Promise<{ itcId: string }> }
) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server admin client is not configured." },
      { status: 503 }
    );
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itcId } = await context.params;
  if (!itcId?.trim()) {
    return NextResponse.json({ error: "itcId is required." }, { status: 400 });
  }

  let body: { workerId?: string };
  try {
    body = (await request.json()) as { workerId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.workerId?.trim()) {
    return NextResponse.json({ error: "workerId is required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  try {
    const result = await completeWorkerItcAdmin(admin, {
      itcId: itcId.trim(),
      workerId: body.workerId.trim(),
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to complete ITC.",
      },
      { status: 500 }
    );
  }
}
