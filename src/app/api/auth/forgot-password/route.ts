export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  assertActionUrl,
  buildWorkerInviteEmailContent,
} from "@/lib/worker-invite-email-template";

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.site-bolt.com.au"
  ).replace(/\/$/, "");
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );
    if (match) return match;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

export async function sendPasswordResetEmail(normalizedEmail: string): Promise<{ error: string | null }> {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { error: "Server error: RESEND_API_KEY is not configured." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." };
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: worker, error: workerError } = await supabaseAdmin
      .from("workers")
      .select("id, email")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (workerError) {
      console.error("[/api/auth/forgot-password] worker lookup failed:", workerError.message);
    }

    const workerFound = Boolean(worker?.id);
    const authUser = workerFound ? null : await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    if (!workerFound && !authUser) {
      return { error: "No account found matching this email." };
    }

    const base = siteOrigin();
    const resetLink = `${base}/reset-password?email=${encodeURIComponent(normalizedEmail)}`;
    const safeUrl = assertActionUrl(resetLink);
    const { html, text } = buildWorkerInviteEmailContent(safeUrl);
    const resetHtml = html
      .replace(/Set Your Password/g, "Reset Password")
      .replace("Welcome to SiteBolt.", "Reset your SiteBolt password.")
      .replace(
        "Please click the link below to set your password and access your account:",
        "Tap the button below to reset your password:"
      );
    const resetText = text
      .replace(/Set Your Password/g, "Reset Password")
      .replace("Welcome to SiteBolt.", "Reset your SiteBolt password.")
      .replace(
        "Please click the link below to set your password and access your account:",
        "Tap the button below to reset your password:"
      );

    const resend = new Resend(apiKey);
    const resendResult = await resend.emails.send({
      from: DEFAULT_SYSTEM_FROM_EMAIL,
      to: [normalizedEmail],
      subject: "Reset your SiteBolt password",
      html: resetHtml,
      text: resetText,
    });

    if (resendResult.error) {
      console.error("[forgot-password] Resend API error:", resendResult.error);
      return { error: resendResult.error.message };
    }

    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[/api/auth/forgot-password] unexpected error:", message);
    return { error: message };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const normalizedEmail =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const result = await sendPasswordResetEmail(normalizedEmail);
    if (result.error?.includes("not configured")) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    if (result.error === "No account found matching this email.") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
