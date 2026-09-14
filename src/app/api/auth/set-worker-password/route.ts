export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { validatePassword } from "@/lib/password-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { findAuthUserByEmail } from "@/lib/worker-invite-resend";

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as {
      token?: unknown;
      password?: unknown;
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing setup token. Please check your invitation link." },
        { status: 400 }
      );
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: worker, error } = await supabaseAdmin
      .from("workers")
      .select("*")
      .eq("invite_token", token)
      .single();

    if (error || !worker) {
      return NextResponse.json(
        { error: "Invalid or already used token" },
        { status: 400 }
      );
    }

    const email = typeof worker.email === "string" ? worker.email.trim() : "";
    if (!email) {
      return NextResponse.json(
        { error: "Worker record is missing an email address." },
        { status: 400 }
      );
    }

    let authUserId =
      (typeof worker.auth_user_id === "string" && worker.auth_user_id.trim()) ||
      (typeof worker.user_id === "string" && worker.user_id.trim()) ||
      "";

    if (!authUserId) {
      const existingUser = await findAuthUserByEmail(supabaseAdmin, email);
      if (existingUser) {
        authUserId = existingUser.id;
      } else {
        const { data: newUser, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
        if (createError || !newUser.user) {
          throw createError ?? new Error("Unable to create auth user.");
        }
        authUserId = newUser.user.id;
      }
    }

    const { error: updateAuthError } =
      await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password,
        email_confirm: true,
      });
    if (updateAuthError) {
      throw updateAuthError;
    }

    const { error: clearError } = await supabaseAdmin
      .from("workers")
      .update({
        auth_user_id: authUserId,
        invite_token: null,
      })
      .eq("id", worker.id);

    if (clearError) {
      const retry = await supabaseAdmin
        .from("workers")
        .update({ invite_token: null })
        .eq("id", worker.id);
      if (retry.error) {
        throw retry.error;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to set worker password.";
    console.error("[/api/auth/set-worker-password]", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
