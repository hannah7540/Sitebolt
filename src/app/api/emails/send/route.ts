export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { composeEmailAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import { normalizeComposeInput } from "@/lib/email-payload-utils";

export async function POST(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    let raw: Record<string, unknown>;
    try {
      raw = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const normalized = normalizeComposeInput(raw);
    if (!normalized.subject?.trim() || !normalized.body_html?.trim()) {
      return NextResponse.json(
        { error: "Subject and body are required." },
        { status: 400 }
      );
    }

    const result = await composeEmailAdmin(auth.admin, {
      ...normalized,
      created_by: auth.workerId ?? normalized.created_by,
      created_by_name: auth.workerName ?? normalized.created_by_name,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ message: result.message });
  } catch (error) {
    console.error("[POST /api/emails/send]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send email.",
      },
      { status: 500 }
    );
  }
}
