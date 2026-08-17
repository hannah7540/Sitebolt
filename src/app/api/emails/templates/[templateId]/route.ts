export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  deleteEmailTemplateAdmin,
  saveEmailTemplateAdmin,
} from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import type { SaveEmailTemplateInput } from "@/lib/email-module-types";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    const { templateId } = await context.params;
    let body: SaveEmailTemplateInput;
    try {
      body = (await request.json()) as SaveEmailTemplateInput;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const result = await saveEmailTemplateAdmin(auth.admin, body, templateId.trim());
    if (result.error) {
      console.error("[PATCH /api/emails/templates]", result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ template: result.template });
  } catch (error) {
    console.error("[PATCH /api/emails/templates]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save template.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const { templateId } = await context.params;
  const result = await deleteEmailTemplateAdmin(auth.admin, templateId.trim());
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
