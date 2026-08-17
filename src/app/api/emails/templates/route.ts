export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  fetchEmailTemplatesAdmin,
  saveEmailTemplateAdmin,
} from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import type { SaveEmailTemplateInput } from "@/lib/email-module-types";

export async function GET() {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const result = await fetchEmailTemplatesAdmin(auth.admin);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ templates: result.templates });
}

export async function POST(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    let body: SaveEmailTemplateInput;
    try {
      body = (await request.json()) as SaveEmailTemplateInput;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

  const result = await saveEmailTemplateAdmin(auth.admin, {
    ...body,
    created_by: auth.workerId,
  });

    if (result.error) {
      console.error("[POST /api/emails/templates]", result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ template: result.template });
  } catch (error) {
    console.error("[POST /api/emails/templates]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save template.",
      },
      { status: 500 }
    );
  }
}
