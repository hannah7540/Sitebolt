export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { uploadWorkerItcChecklistPhotoAdmin } from "@/lib/worker-itc-admin-mutations";

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server admin client is not configured." },
      { status: 503 }
    );
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const itcId = String(formData.get("itcId") ?? "").trim();
  const itemKey = String(formData.get("itemKey") ?? "").trim();
  const file = formData.get("file");

  if (!projectId || !itcId || !itemKey || !(file instanceof File)) {
    return NextResponse.json(
      { error: "projectId, itcId, itemKey, and file are required." },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const result = await uploadWorkerItcChecklistPhotoAdmin(admin, {
    projectId,
    itcId,
    itemKey,
    file,
    fileName: file.name || "photo.jpg",
    contentType: file.type || "image/jpeg",
  });

  if (result.error || !result.url) {
    return NextResponse.json(
      { error: result.error ?? "Photo upload failed." },
      { status: 400 }
    );
  }

  return NextResponse.json({ url: result.url });
}
