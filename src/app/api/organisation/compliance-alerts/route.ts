import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { fetchComplianceAlerts } from "@/lib/compliance-alerts-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server admin client is not configured." },
      { status: 503 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const summary = await fetchComplianceAlerts({ admin });
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load compliance alerts.";
    console.error("Compliance alerts load error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
