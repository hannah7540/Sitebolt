/**
 * ============================================================================
 * CRITICAL ARCHITECTURAL LOCK - DO NOT MODIFY OR REFACTOR
 * ============================================================================
 * This route is verified production-ready. It uses:
 * 1. DEFAULT_SYSTEM_FROM_EMAIL (verified sender: hannah@site-bolt.com.au)
 * 2. buildWorkerInviteEmailContent for verified button styling
 * 3. Direct /setyourpassword target to avoid fragile Supabase JWT auth sessions
 *
 * DO NOT touch this file in future refactors without explicit developer override.
 * ============================================================================
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assertActionUrl,
  buildWorkerInviteEmailContent,
} from "@/lib/worker-invite-email-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getResendClient(): Resend | null {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email ? String(body.email).trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const resend = getResendClient();
    if (!resend) {
      console.error("[forgot-password] RESEND_API_KEY is missing");
      return NextResponse.json({ error: "Resend API key missing on server" }, { status: 500 });
    }

    const supabaseAdmin = createSupabaseAdminClient();

    // Check workers table first
    const { data: worker } = await supabaseAdmin
      .from("workers")
      .select("id, email, invite_token")
      .ilike("email", email)
      .maybeSingle();

    // Check auth.users if not found in workers
    let token = worker?.invite_token;
    if (!token) {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      const authUser = authData?.users?.find(
        (u) => u.email?.trim().toLowerCase() === email
      );

      if (!worker && !authUser) {
        console.warn("[forgot-password] No account located for:", email);
        return NextResponse.json({ error: "No account found matching this email address" }, { status: 404 });
      }

      token = "reset";
    }

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.site-bolt.com.au").replace(/\/$/, "");
    const actionUrl = `${origin}/setyourpassword?token=${token}`;
    const safeUrl = assertActionUrl(actionUrl);

    const { html, text } = buildWorkerInviteEmailContent(safeUrl);
    const resetHtml = html
      .replace(/Set Your Password/g, "Reset Password")
      .replace("Welcome to SiteBolt.", "Reset your SiteBolt password.")
      .replace("Please click the link below to set your password and access your account:", "Tap the button below to set a new password:");

    const resetText = `Reset your SiteBolt password\n\nPlease click the link below to set a new password:\n${safeUrl}\n\nIf you did not request this, you can ignore this email.`;

    console.log(`[forgot-password] Attempting Resend dispatch to ${email} from ${DEFAULT_SYSTEM_FROM_EMAIL}`);

    const resendResult = await resend.emails.send({
      from: DEFAULT_SYSTEM_FROM_EMAIL,
      to: [email],
      subject: "Reset your SiteBolt password",
      html: resetHtml,
      text: resetText,
    });

    if (resendResult.error) {
      console.error("[forgot-password] Resend returned API error:", resendResult.error);
      return NextResponse.json({ error: resendResult.error.message }, { status: 400 });
    }

    console.log("[forgot-password] Dispatch successful, Resend ID:", resendResult.data?.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[forgot-password] Unhandled exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
