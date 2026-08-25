export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { replySmsAdmin } from "@/lib/sms-module-admin";
import { requireSmsApiAccess } from "@/lib/sms-auth";

export async function POST(request: Request) {
  const auth = await requireSmsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      to?: string;
      message_body?: string;
      worker_id?: string | null;
      project_id?: string | null;
    };

    const result = await replySmsAdmin(auth.admin, {
      to: String(body.to ?? ""),
      message_body: String(body.message_body ?? ""),
      worker_id: body.worker_id ?? null,
      project_id: body.project_id ?? null,
      created_by: auth.workerId,
    });

    if (result.error && !result.message) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: !result.error,
      message: result.message,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reply." },
      { status: 500 }
    );
  }
}
