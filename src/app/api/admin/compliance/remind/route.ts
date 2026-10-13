export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  sendComplianceReminders,
  type ComplianceReminderKind,
} from "@/lib/compliance-reminders";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export async function POST(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = String(body.kind ?? "").trim() as ComplianceReminderKind;
  if (kind !== "swms" && kind !== "induction") {
    return NextResponse.json(
      { error: "kind must be swms or induction." },
      { status: 400 }
    );
  }

  const workerIds = asStringArray(body.worker_ids ?? body.workerIds);
  if (workerIds.length === 0) {
    return NextResponse.json({ error: "worker_ids is required." }, { status: 400 });
  }

  const documentTitle = String(body.document_title ?? body.documentTitle ?? "").trim();
  const documentId = String(body.document_id ?? body.documentId ?? "").trim() || null;

  const result = await sendComplianceReminders(access.admin, {
    kind,
    workerIds,
    documentTitle,
    documentId,
  });

  const delivered = result.emailed + result.sms + result.notified;
  if (delivered === 0) {
    return NextResponse.json(
      {
        error:
          result.errors[0] ??
          "Could not send a reminder. The worker needs an email, phone, or linked login.",
        ...result,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
