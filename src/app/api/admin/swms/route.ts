export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireSwmsAdminAccess } from "@/lib/swms-api-auth";
import {
  createSwmsDocumentAdmin,
  deleteSwmsDocumentAdmin,
  fetchSwmsListAdmin,
  updateSwmsDocumentAdmin,
} from "@/lib/swms-admin-mutations";

export async function GET() {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const { swms, error } = await fetchSwmsListAdmin(access.admin);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ swms, count: swms.length });
}

export async function POST(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  let body: {
    title?: string;
    document_date?: string;
    file_url?: string;
    document_url?: string;
    file_name?: string;
    project_id?: string;
    swms_scope?: "company" | "site_specific";
    version?: string;
    all_workers?: boolean;
    worker_ids?: string[];
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = body.title?.trim();
  const fileUrl = body.file_url?.trim() || body.document_url?.trim();

  if (!title) {
    return NextResponse.json({ error: "title is required." }, { status: 400 });
  }
  if (!fileUrl) {
    return NextResponse.json({ error: "file_url is required." }, { status: 400 });
  }

  const { swms, error } = await createSwmsDocumentAdmin(access.admin, {
    title,
    documentDate: body.document_date,
    fileUrl,
    fileName: body.file_name,
    projectId: body.project_id,
    swmsScope: body.swms_scope,
    version: body.version,
    allWorkers: body.all_workers === true,
    workerIds: Array.isArray(body.worker_ids) ? body.worker_ids : [],
  });

  if (error || !swms) {
    return NextResponse.json({ error: error ?? "Failed to create SWMS." }, { status: 400 });
  }

  return NextResponse.json({ swms }, { status: 201 });
}

export async function PUT(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  let body: {
    id?: string;
    title?: string;
    document_date?: string;
    file_url?: string;
    document_url?: string;
    file_name?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const fileUrl = body.file_url?.trim() || body.document_url?.trim();
  const { error } = await updateSwmsDocumentAdmin(access.admin, id, {
    title: body.title,
    documentDate: body.document_date,
    fileUrl,
    fileName: body.file_name,
  });

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await requireSwmsAdminAccess();
  if (!access.ok) return access.response;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });
  }

  const { error } = await deleteSwmsDocumentAdmin(access.admin, id);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
