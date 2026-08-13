import { NextResponse } from "next/server";
import { sendWorkerPasswordResetEmail } from "@/lib/worker-auth-email";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim();

    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const result = await sendWorkerPasswordResetEmail(email);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: "Password setup email sent.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to send password reset email.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
