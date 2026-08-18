export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import { assignSwmsWorkersAdmin } from "@/lib/swms-admin-mutations";

export async function POST(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  let body: {
    swms_id?: string;
    worker_ids?: string[];
    project_id?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const swmsId = body.swms_id?.trim();
  const workerIds = Array.isArray(body.worker_ids)
    ? body.worker_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (!swmsId) {
    return NextResponse.json({ error: "swms_id is required." }, { status: 400 });
  }
  if (workerIds.length === 0) {
    return NextResponse.json({ error: "worker_ids must include at least one worker." }, { status: 400 });
  }

  const { error, created } = await assignSwmsWorkersAdmin(access.admin, {
    swmsId,
    workerIds,
    projectId: body.project_id,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, created });
}
