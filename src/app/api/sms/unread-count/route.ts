export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { fetchUnreadSmsCountAdmin } from "@/lib/sms-module-admin";
import { requireSmsApiAccess } from "@/lib/sms-auth";

export async function GET() {
  const auth = await requireSmsApiAccess();
  if (!auth.ok) return auth.response;

  const count = await fetchUnreadSmsCountAdmin(auth.admin);
  return NextResponse.json({ count });
}
