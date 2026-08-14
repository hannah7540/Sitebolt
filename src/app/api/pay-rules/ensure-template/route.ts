export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { fetchPayRuleTemplateIdByNameAdmin } from "@/lib/pay-rule-templates";

/** Ensure a pay rule template exists (server/service-role only). Never returns UI errors. */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json({ success: true, id: null });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name =
    body && typeof body === "object" && typeof body.name === "string"
      ? body.name.trim()
      : "";

  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await fetchPayRuleTemplateIdByNameAdmin(admin, name);
    return NextResponse.json({
      success: true,
      id: result.id,
    });
  } catch (err) {
    console.warn("[api/pay-rules/ensure-template] Pay rule save skipped:", err);
    return NextResponse.json({ success: true, id: null });
  }
}
