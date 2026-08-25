export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  buildSmsThreads,
  fetchSmsMessagesAdmin,
} from "@/lib/sms-module-admin";
import { requireSmsApiAccess } from "@/lib/sms-auth";
import type { SmsFolder } from "@/lib/sms-types";

export async function GET(request: Request) {
  const auth = await requireSmsApiAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const folder = (searchParams.get("folder") === "sent" ? "sent" : "inbox") as SmsFolder;

  const result = await fetchSmsMessagesAdmin(auth.admin, folder);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    messages: result.messages,
    threads: folder === "inbox" ? buildSmsThreads(result.messages) : undefined,
  });
}
