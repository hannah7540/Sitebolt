export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { fetchSmsThreadMessagesAdmin } from "@/lib/sms-module-admin";
import { requireSmsApiAccess } from "@/lib/sms-auth";

export async function GET(request: Request) {
  const auth = await requireSmsApiAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const result = await fetchSmsThreadMessagesAdmin(auth.admin, {
    workerId: searchParams.get("workerId"),
    phone: searchParams.get("phone"),
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ messages: result.messages });
}
