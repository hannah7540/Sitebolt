export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { sendSubcontractorInviteEmail } from "@/lib/subcontractor-invite-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in to send invitations." }, { status: 401 });
    }

    const body = (await request.json()) as {
      email?: string;
      companyName?: string;
      contactName?: string;
    };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
    const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const sent = await sendSubcontractorInviteEmail({
      email,
      companyName,
      contactName,
    });

    if (!sent.success) {
      return NextResponse.json(
        { error: sent.error ?? "Failed to send invitation email." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send invitation email.",
      },
      { status: 500 }
    );
  }
}
