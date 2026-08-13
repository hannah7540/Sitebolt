import { NextResponse } from "next/server";
import { sendWorkerInviteEmailViaResend } from "@/lib/worker-invite-resend";

export const dynamic = "force-dynamic";

function parseEmail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email.trim() : "";
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[/api/workers/invite] Invalid JSON body:", error);
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = parseEmail(body);
    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const result = await sendWorkerInviteEmailViaResend(email);

    if (!result.success) {
      console.error("[/api/workers/invite] Failed to send invite:", result.error);
      return NextResponse.json({ error: result.error ?? "Failed to send invite." }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Invite sent successfully",
        email,
        messageId: result.messageId,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[/api/workers/invite] Unexpected error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send worker invite.",
      },
      { status: 400 }
    );
  }
}
