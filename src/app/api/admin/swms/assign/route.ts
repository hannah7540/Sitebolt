export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  assignSwmsWorkersAdmin,
  resolveProjectMemberWorkerIdsAdmin,
} from "@/lib/swms-admin-mutations";
import { notifyWorkersOfSwmsAssignment } from "@/lib/swms-assignment-notify";
import { isValidSwmsId } from "@/lib/supabase";

export async function POST(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  let body: {
    swms_id?: string;
    /** Explicit parent document id when swms_id is a project/legacy relation id. */
    swms_document_id?: string;
    document_id?: string;
    worker_ids?: string[];
    project_id?: string;
    /** When true with project_id, resolve and assign all current project members. */
    assign_all_project_members?: boolean;
    mode?: "project" | "workers";
    swms_title?: string;
    /** Skip inserts; email/notify workers who already received assignments. */
    notify_only?: boolean;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Prefer explicit document FK fields over a project-SWMS relation id.
  const requestSwmsId = [
    body.swms_document_id,
    body.document_id,
    body.swms_id,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => isValidSwmsId(value));

  if (!requestSwmsId) {
    console.error("[swms-assign] reject request — invalid swms_id:", {
      swms_id: body.swms_id,
      swms_document_id: body.swms_document_id,
      document_id: body.document_id,
    });
    return NextResponse.json(
      {
        error:
          "swms_id must be a valid UUID referencing swms_documents.id (use swms_document_id when assigning from a project SWMS relation).",
      },
      { status: 400 }
    );
  }

  console.info("[swms-assign] request", {
    swms_id: requestSwmsId,
    raw_swms_id: body.swms_id,
    swms_document_id: body.swms_document_id,
    document_id: body.document_id,
    mode: body.mode,
    project_id: body.project_id,
    worker_count: Array.isArray(body.worker_ids) ? body.worker_ids.length : 0,
    notify_only: Boolean(body.notify_only),
  });

  const projectId = body.project_id?.trim() || undefined;
  const mode =
    body.mode ??
    (body.assign_all_project_members || (projectId && !body.worker_ids?.length)
      ? "project"
      : "workers");

  /** Notify-only path (e.g. after client-side push/clone already inserted rows). */
  if (body.notify_only) {
    const notifyIds = Array.isArray(body.worker_ids)
      ? body.worker_ids.map((id) => String(id).trim()).filter(Boolean)
      : [];
    if (notifyIds.length === 0) {
      return NextResponse.json({ ok: true, notified: { emailed: 0, errors: [] } });
    }

    let swmsTitle = body.swms_title?.trim() || "";
    if (!swmsTitle) {
      const { data } = await access.admin
        .from("swms_documents")
        .select("title")
        .eq("id", requestSwmsId)
        .maybeSingle();
      swmsTitle = String((data as { title?: string } | null)?.title ?? "SWMS");
    }

    const notify = await notifyWorkersOfSwmsAssignment(access.admin, {
      workerIds: notifyIds,
      swmsTitle,
    });
    return NextResponse.json({ ok: true, notified: notify });
  }

  let workerIds = Array.isArray(body.worker_ids)
    ? body.worker_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];

  if (mode === "project" || body.assign_all_project_members) {
    if (!projectId) {
      return NextResponse.json(
        { error: "project_id is required when assigning to a full project." },
        { status: 400 }
      );
    }

    const resolved = await resolveProjectMemberWorkerIdsAdmin(access.admin, projectId);
    if (resolved.error) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }
    workerIds = resolved.workerIds;

    if (workerIds.length === 0) {
      return NextResponse.json(
        { error: "No workers are currently assigned to the selected project." },
        { status: 400 }
      );
    }
  }

  if (workerIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one worker, or choose a project with members." },
      { status: 400 }
    );
  }

  const { error, created, createdWorkerIds, skipped } = await assignSwmsWorkersAdmin(
    access.admin,
    {
      swmsId: requestSwmsId,
      workerIds,
      projectId,
    }
  );

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  let notify: { emailed: number; errors: string[] } = { emailed: 0, errors: [] };
  if (createdWorkerIds.length > 0) {
    let swmsTitle = body.swms_title?.trim() || "";
    if (!swmsTitle) {
      const { data } = await access.admin
        .from("swms_documents")
        .select("title")
        .eq("id", requestSwmsId)
        .maybeSingle();
      swmsTitle = String((data as { title?: string } | null)?.title ?? "SWMS");
    }

    notify = await notifyWorkersOfSwmsAssignment(access.admin, {
      workerIds: createdWorkerIds,
      swmsTitle,
    });
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    created_worker_ids: createdWorkerIds,
    notified: notify,
  });
}
