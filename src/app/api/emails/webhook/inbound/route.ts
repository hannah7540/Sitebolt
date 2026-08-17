export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { ingestInboundEmailAdmin } from "@/lib/email-module-admin";
import type { InboundEmailWebhookPayload } from "@/lib/email-module-types";

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server admin client is not configured." },
      { status: 503 }
    );
  }

  const webhookSecret = process.env.EMAIL_INBOUND_WEBHOOK_SECRET?.trim();
  if (webhookSecret) {
    const provided =
      request.headers.get("x-email-webhook-secret") ??
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== webhookSecret) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }
  }

  let payload: InboundEmailWebhookPayload;
  try {
    payload = (await request.json()) as InboundEmailWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await ingestInboundEmailAdmin(admin, payload);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ message: result.message, ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to ingest inbound email.",
      },
      { status: 500 }
    );
  }
}
