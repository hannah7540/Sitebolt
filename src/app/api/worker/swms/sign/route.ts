export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAuthenticatedWorkerAccess } from "@/lib/swms-api-auth";
import { signWorkerSwmsAssignmentAdmin } from "@/lib/swms-admin-mutations";

export async function POST(request: Request) {
  const access = await requireAuthenticatedWorkerAccess();
  if (!access.ok) return access.response;

  let body: {
    token?: string;
    signature_url?: string;
    acknowledged_risks?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const token = body.token?.trim();
  const signatureUrl = body.signature_url?.trim();

  if (!token) {
    return NextResponse.json({ error: "token is required." }, { status: 400 });
  }
  if (!signatureUrl) {
    return NextResponse.json({ error: "signature_url is required." }, { status: 400 });
  }
  if (body.acknowledged_risks !== true) {
    return NextResponse.json(
      { error: "acknowledged_risks must be true before signing." },
      { status: 400 }
    );
  }

  const { error } = await signWorkerSwmsAssignmentAdmin(access.admin, {
    workerId: access.workerId,
    token,
    signatureUrl,
    acknowledgedRisks: true,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
