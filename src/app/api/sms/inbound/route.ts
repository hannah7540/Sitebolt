export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { normalizePhoneNumber } from "@/lib/sms-phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { ingestInboundSmsAdmin } from "@/lib/sms-module-admin";
import { emptyTwimlResponse } from "@/lib/sms-service";

async function parseTwilioForm(request: Request): Promise<{
  from: string;
  body: string;
  messageSid: string;
}> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    return {
      from: String(json.From ?? json.from ?? ""),
      body: String(json.Body ?? json.body ?? ""),
      messageSid: String(json.MessageSid ?? json.messageSid ?? ""),
    };
  }

  const form = await request.formData();
  return {
    from: String(form.get("From") ?? form.get("from") ?? ""),
    body: String(form.get("Body") ?? form.get("body") ?? ""),
    messageSid: String(form.get("MessageSid") ?? form.get("SmsSid") ?? ""),
  };
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return new NextResponse(emptyTwimlResponse(), {
      status: 503,
      headers: { "Content-Type": "text/xml" },
    });
  }

  try {
    const payload = await parseTwilioForm(request);
    const from =
      normalizePhoneNumber(payload.from) || String(payload.from ?? "").trim();
    const admin = createSupabaseAdminClient();
    const result = await ingestInboundSmsAdmin(admin, {
      from,
      body: payload.body,
      messageSid: payload.messageSid || null,
    });

    if (result.error) {
      console.error("[POST /api/sms/inbound]", result.error);
    }

    return new NextResponse(emptyTwimlResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[POST /api/sms/inbound]", error);
    return new NextResponse(emptyTwimlResponse(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
