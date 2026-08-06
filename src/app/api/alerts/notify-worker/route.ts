import { NextResponse } from "next/server";
import { notifyWorkerAboutExpiries } from "@/lib/expiry-alerts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { workerId?: string };
    const workerId = body.workerId?.trim();

    if (!workerId) {
      return NextResponse.json({ error: "workerId is required." }, { status: 400 });
    }

    const result = await notifyWorkerAboutExpiries(workerId);
    if (result.error && !result.sent) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to notify worker.",
      },
      { status: 500 }
    );
  }
}
