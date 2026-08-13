import { NextResponse } from "next/server";
import { ensureWorkerAuthUserAndInvite } from "@/lib/worker-auth-email";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      workerId?: string;
      fullName?: string;
      securityRole?: string;
    };
    const email = body.email?.trim();

    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const result = await ensureWorkerAuthUserAndInvite(email, {
      workerId: body.workerId,
      fullName: body.fullName,
      securityRole: body.securityRole,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      workerId: body.workerId ?? null,
      authUserId: result.authUserId,
      inviteSent: result.inviteSent,
      message: "Invite email sent.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send worker invite.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
