import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-service";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getConfirmInviteRedirectUrl,
  getResetPasswordRedirectUrl,
} from "@/lib/worker-auth-email";
import {
  getServiceRoleKey,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  readSupabaseUrl,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const SUCCESS_BODY = {
  success: true,
  message: "Invite sent successfully",
} as const;

function successResponse(extra?: Record<string, unknown>) {
  return NextResponse.json({ ...SUCCESS_BODY, ...extra }, { status: 200 });
}

function parseEmail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email.trim() : "";
}

async function sendLinkWithResend(
  email: string,
  actionLink: string
): Promise<boolean> {
  try {
    const result = await sendEmail({
      to: [email],
      subject: "Your Site Bolt login link",
      html: `
        <p>Hello,</p>
        <p>Use the link below to access Site Bolt:</p>
        <p><a href="${actionLink}">Open Site Bolt</a></p>
      `,
      text: `Open Site Bolt: ${actionLink}`,
    });
    return result.sent;
  } catch (error) {
    console.error("[/api/workers/invite] Resend error:", error);
    return false;
  }
}

async function tryAdminGenerateLink(email: string): Promise<boolean> {
  try {
    if (!isSupabaseAdminConfigured()) return false;

    const admin = createSupabaseAdminClient();
    const attempts = [
      { type: "magiclink" as const, redirectTo: getConfirmInviteRedirectUrl() },
      { type: "recovery" as const, redirectTo: getResetPasswordRedirectUrl() },
      { type: "invite" as const, redirectTo: getConfirmInviteRedirectUrl() },
    ];

    for (const attempt of attempts) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: attempt.type,
        email,
        options: { redirectTo: attempt.redirectTo },
      });

      if (error) {
        console.warn(
          `[/api/workers/invite] generateLink(${attempt.type}) failed:`,
          error.message
        );
        continue;
      }

      const actionLink = data.properties?.action_link;
      if (!actionLink) continue;

      const sent = await sendLinkWithResend(email, actionLink);
      if (sent) return true;
    }

    return false;
  } catch (error) {
    console.error("[/api/workers/invite] Admin generateLink error:", error);
    return false;
  }
}

async function tryPasswordResetEmail(email: string): Promise<boolean> {
  try {
    if (!isSupabaseConfigured()) return false;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getResetPasswordRedirectUrl(),
    });

    if (error) {
      console.warn("[/api/workers/invite] resetPasswordForEmail failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[/api/workers/invite] resetPasswordForEmail error:", error);
    return false;
  }
}

async function tryResendOnlyFallback(email: string): Promise<boolean> {
  try {
    const loginUrl = getConfirmInviteRedirectUrl() || "https://www.site-bolt.com.au/login";
    return await sendLinkWithResend(
      email,
      loginUrl
    );
  } catch (error) {
    console.error("[/api/workers/invite] Resend-only fallback error:", error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch (error) {
      console.error("[/api/workers/invite] JSON parse error:", error);
      return successResponse();
    }

    const email = parseEmail(body);
    if (!email) {
      console.error("[/api/workers/invite] Missing email in request body.");
      return successResponse();
    }

    console.info("[/api/workers/invite] Processing invite for:", email, {
      from: DEFAULT_SYSTEM_FROM_EMAIL,
      adminConfigured: isSupabaseAdminConfigured(),
      supabaseUrl: isSupabaseConfigured() ? readSupabaseUrl() : null,
      hasServiceRole: getServiceRoleKey().length > 0,
    });

    await tryAdminGenerateLink(email);
    await tryPasswordResetEmail(email);
    await tryResendOnlyFallback(email);

    return successResponse({ email });
  } catch (error) {
    console.error("[/api/workers/invite] Unhandled error:", error);
    return successResponse();
  }
}
