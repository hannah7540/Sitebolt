export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { uploadEmailSignatureImageAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";

export async function POST(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadEmailSignatureImageAdmin(auth.admin, {
      filename: file.name || "logo.png",
      contentType: file.type || "image/png",
      buffer,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to upload signature image.",
      },
      { status: 500 }
    );
  }
}
