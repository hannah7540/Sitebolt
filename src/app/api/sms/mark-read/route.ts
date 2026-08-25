export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { markSmsThreadReadAdmin } from "@/lib/sms-module-admin";
import { requireSmsApiAccess } from "@/lib/sms-auth";

export async function POST(request: Request) {
  const auth = await requireSmsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      workerId?: string;
      phone?: string;
    };
    const result = await markSmsThreadReadAdmin(auth.admin, {
      workerId: body.workerId,
      phone: body.phone,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ updated: result.updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark read." },
      { status: 500 }
    );
  }
}
