export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { composeEmailAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import type { ComposeEmailInput } from "@/lib/email-module-types";

export async function POST(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  let body: ComposeEmailInput;
  try {
    body = (await request.json()) as ComposeEmailInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.subject?.trim() || !body.body_html?.trim()) {
    return NextResponse.json(
      { error: "Subject and body are required." },
      { status: 400 }
    );
  }

  const result = await composeEmailAdmin(auth.admin, {
    ...body,
    created_by: auth.workerId ?? body.created_by,
    created_by_name: auth.workerName ?? body.created_by_name,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ message: result.message });
}
