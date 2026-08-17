export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  deleteScheduledEmailAdmin,
  updateScheduledEmailAdmin,
} from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const { messageId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await updateScheduledEmailAdmin(auth.admin, messageId.trim(), body);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ message: result.message });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ messageId: string }> }
) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const { messageId } = await context.params;
  const result = await deleteScheduledEmailAdmin(auth.admin, messageId.trim());
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
