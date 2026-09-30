export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import { sendSwmsReviewReminder } from "@/lib/swms-review";

export async function POST(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  let body: { projectId?: string; projectName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const projectId = body.projectId?.trim() ?? "";
  if (!projectId) {
    return NextResponse.json({ error: "Project is required." }, { status: 400 });
  }

  const result = await sendSwmsReviewReminder(projectId, {
    projectName: body.projectName,
  });
  if (!result.sent) {
    return NextResponse.json({ error: result.error ?? "Failed to send reminder." }, { status: 400 });
  }
  return NextResponse.json({ sent: true });
}
