export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { submitItcSignoffAdmin } from "@/lib/itp-itc-admin-mutations";

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
    signoffId?: string;
    itcId?: string;
    signedByWorkerId?: string;
    autoVerify?: boolean;
    verifiedBy?: string;
    verifiedByName?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.signoffId?.trim() || !body.itcId?.trim() || !body.signedByWorkerId?.trim()) {
    return NextResponse.json(
      { error: "signoffId, itcId, and signedByWorkerId are required." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const result = await submitItcSignoffAdmin(admin, {
    signoffId: body.signoffId.trim(),
    itcId: body.itcId.trim(),
    signedByWorkerId: body.signedByWorkerId.trim(),
    autoVerify: body.autoVerify === true,
    verifiedBy: body.verifiedBy?.trim(),
    verifiedByName: body.verifiedByName?.trim(),
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
