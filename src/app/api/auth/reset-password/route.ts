export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { validatePassword } from "@/lib/password-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  readPasswordResetToken,
  sendPasswordResetEmail,
} from "@/app/api/auth/forgot-password/route";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      token?: unknown;
      password?: unknown;
      newPassword?: unknown;
    } | null;

    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const newPassword =
      typeof body?.newPassword === "string"
        ? body.newPassword
        : typeof body?.password === "string"
          ? body.password
          : "";
    const normalizedEmail =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (token && newPassword) {
      if (!isSupabaseAdminConfigured()) {
        return NextResponse.json(
          { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." },
          { status: 500 }
        );
      }

      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        return NextResponse.json({ error: passwordError }, { status: 400 });
      }

      const payload = readPasswordResetToken(token);
      if (!payload) {
        return NextResponse.json(
          { error: "This reset link is invalid or has expired. Request a new one from the login page." },
          { status: 400 }
        );
      }

      const supabaseAdmin = createSupabaseAdminClient();
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        payload.sub,
        { password: newPassword }
      );

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (normalizedEmail) {
      const result = await sendPasswordResetEmail(normalizedEmail);
      if (result.error?.includes("not configured")) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }
      return NextResponse.json({ success: true }, { status: 200 });
    }

    return NextResponse.json(
      { error: "A reset token and new password are required." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
