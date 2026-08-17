export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  saveWorkerItcChecklistAdmin,
  type SaveChecklistItemInput,
} from "@/lib/worker-itc-admin-mutations";

export async function POST(request: Request) {
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

  let body: {
    itcId?: string;
    workerId?: string;
    workerName?: string;
    items?: SaveChecklistItemInput[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.itcId?.trim() || !body.workerId?.trim() || !body.workerName?.trim()) {
    return NextResponse.json(
      { error: "itcId, workerId, and workerName are required." },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items array is required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const result = await saveWorkerItcChecklistAdmin(admin, {
    itcId: body.itcId.trim(),
    workerId: body.workerId.trim(),
    workerName: body.workerName.trim(),
    items: body.items,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
