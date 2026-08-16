export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  createProjectItpAdmin,
  type CreateItpAdminInput,
} from "@/lib/itp-itc-admin-mutations";

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

  let body: CreateItpAdminInput;
  try {
    body = (await request.json()) as CreateItpAdminInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body?.project_id?.trim() || !body?.title?.trim() || !body?.trade_category?.trim()) {
    return NextResponse.json(
      { error: "project_id, title, and trade_category are required." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const result = await createProjectItpAdmin(admin, body);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ itpId: result.itpId });
}
