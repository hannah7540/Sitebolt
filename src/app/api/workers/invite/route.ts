import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[/api/workers/invite] Invalid JSON body:", error);
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email =
      body && typeof body === "object" && typeof (body as { email?: unknown }).email === "string"
        ? (body as { email: string }).email.trim()
        : "";

    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    const apiKey = "re_epw5FP4m_2FTPUBMy24UwCoQeW2sv2QnR";
    const resend = new Resend(apiKey);

    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (error || !data?.properties?.action_link) {
      console.error("[/api/workers/invite] generateLink failed:", error?.message);
      return NextResponse.json(
        { error: error?.message ?? "Unable to generate auth link for this worker." },
        { status: 400 }
      );
    }

    const resendResult = await resend.emails.send({
      from: "Site Bolt <hannah@site-bolt.com.au>",
      to: [email],
      subject: "Set up your Site Bolt account",
      html: `<p>Click here to complete setup: <a href="${data.properties.action_link}">Set Up Account</a></p>`,
    });

    if (resendResult.error) {
      console.error("[/api/workers/invite] Resend error:", resendResult.error);
      return NextResponse.json({ error: resendResult.error.message }, { status: 400 });
    }

    return NextResponse.json(
      { success: true, message: "Invite email sent" },
      { status: 200 }
    );
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
