export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { setWorkerRevokedAccess } from "@/lib/worker-revocation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      workerId?: string;
      revoked?: boolean;
    };

    const workerId = body.workerId?.trim();
    if (!workerId) {
      return NextResponse.json({ error: "workerId is required." }, { status: 400 });
    }

    if (typeof body.revoked !== "boolean") {
      return NextResponse.json(
        { error: "revoked must be a boolean." },
        { status: 400 }
      );
    }

    const result = await setWorkerRevokedAccess(workerId, body.revoked);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      revoked: body.revoked,
      message: body.revoked
        ? "Worker access successfully revoked."
        : "Worker access restored.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update worker access.",
      },
      { status: 500 }
    );
  }
}
