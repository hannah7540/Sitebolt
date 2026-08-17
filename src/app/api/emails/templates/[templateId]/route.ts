export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  deleteEmailTemplateAdmin,
  saveEmailTemplateAdmin,
} from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import { normalizeSaveTemplateInput } from "@/lib/email-payload-utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    const { templateId } = await context.params;
    let raw: Record<string, unknown>;
    try {
      raw = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const normalized = normalizeSaveTemplateInput(raw);
    if (!normalized.subject || !normalized.body) {
      return NextResponse.json(
        { error: "Please enter a subject and body" },
        { status: 400 }
      );
    }

    const result = await saveEmailTemplateAdmin(
      auth.admin,
      { ...normalized, created_by: auth.workerId },
      templateId.trim()
    );
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
