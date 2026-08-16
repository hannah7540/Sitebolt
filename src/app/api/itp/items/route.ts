export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { updateItpItemAdmin } from "@/lib/itp-itc-admin-mutations";

export async function PATCH(request: Request) {
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

  let body: { itemId?: string; patch?: Record<string, unknown> };
  try {
    body = (await request.json()) as { itemId?: string; patch?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.itemId?.trim() || !body.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "itemId and patch are required." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const result = await updateItpItemAdmin(admin, body.itemId.trim(), body.patch);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
