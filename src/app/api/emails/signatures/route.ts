export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  fetchEmailSignatureForEditorAdmin,
  fetchLiveEmailSignatureAdmin,
  saveEmailSignatureAdmin,
} from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import type { SaveEmailSignatureInput } from "@/lib/email-module-types";

export async function GET(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const liveOnly = searchParams.get("live") === "true";

  const result = liveOnly
    ? await fetchLiveEmailSignatureAdmin(auth.admin)
    : await fetchEmailSignatureForEditorAdmin(auth.admin);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ signature: result.signature });
}

export async function POST(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  let body: SaveEmailSignatureInput;
  try {
    body = (await request.json()) as SaveEmailSignatureInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.body_html?.trim()) {
    return NextResponse.json({ error: "Signature body is required." }, { status: 400 });
  }

  const result = await saveEmailSignatureAdmin(auth.admin, {
    ...body,
    created_by: auth.workerId,
    created_by_name: auth.workerName,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ signature: result.signature });
}
