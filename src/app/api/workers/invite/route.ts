import { NextResponse } from "next/server";
import { ensureWorkerAuthUserAndInvite } from "@/lib/worker-auth-email";

function parseInviteRequestBody(body: unknown): {
  email: string;
  workerId?: string;
  fullName?: string;
  securityRole?: string;
} {
  if (!body || typeof body !== "object") {
    return { email: "" };
  }

  const record = body as Record<string, unknown>;

  return {
    email: typeof record.email === "string" ? record.email.trim() : "",
    workerId: typeof record.workerId === "string" ? record.workerId.trim() : undefined,
    fullName: typeof record.fullName === "string" ? record.fullName.trim() : undefined,
    securityRole:
      typeof record.securityRole === "string" ? record.securityRole.trim() : undefined,
  };
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { email, workerId, fullName, securityRole } = parseInviteRequestBody(body);

    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const result = await ensureWorkerAuthUserAndInvite(email, {
      workerId,
      fullName,
      securityRole,
    });

    if (result.error) {
      console.error("[/api/workers/invite] Failed to send invite:", {
        email,
        workerId: workerId ?? null,
        error: result.error,
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      workerId: workerId ?? null,
      authUserId: result.authUserId,
      inviteSent: result.inviteSent,
      message: "Invite sent successfully",
    });
  } catch (error) {
    console.error("[/api/workers/invite] Unexpected error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send worker invite.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
