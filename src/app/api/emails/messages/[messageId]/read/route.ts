export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { markEmailThreadReadAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const { messageId } = await context.params;
  const result = await markEmailThreadReadAdmin(auth.admin, messageId.trim());
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
