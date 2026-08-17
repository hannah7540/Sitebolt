export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { fetchUnreadInboundCountAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";

export async function GET() {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const result = await fetchUnreadInboundCountAdmin(auth.admin);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ count: result.count });
}
