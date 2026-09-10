export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { softDeleteWorker } from "@/lib/worker-revocation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workerId?: string };
    const workerId = body.workerId?.trim();
    if (!workerId) {
      return NextResponse.json({ error: "workerId is required." }, { status: 400 });
    }

    const result = await softDeleteWorker(workerId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message:
        "Worker deleted. Historical records remain available in Admin Reports.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete worker.",
      },
      { status: 500 }
    );
  }
}
