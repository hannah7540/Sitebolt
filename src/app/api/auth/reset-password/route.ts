export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { validatePassword } from "@/lib/password-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: unknown;
      newPassword?: unknown;
      password?: unknown;
    } | null;

    const newPassword =
      typeof body?.newPassword === "string"
        ? body.newPassword
        : typeof body?.password === "string"
          ? body.password
          : "";
    const normalizedEmail =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." },
        { status: 500 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const user = await findAuthUserByEmail(supabaseAdmin, normalizedEmail);
    if (!user?.id) {
      return NextResponse.json(
        { error: "No account found matching this email." },
        { status: 404 }
      );
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { data: worker, error: workerError } = await supabaseAdmin
      .from("workers")
      .select("id, auth_user_id")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (workerError) {
      console.error("[/api/auth/reset-password] worker lookup failed:", workerError.message);
    } else if (worker?.id && worker.auth_user_id !== user.id) {
      const { error: linkError } = await supabaseAdmin
        .from("workers")
        .update({ auth_user_id: user.id })
        .eq("id", worker.id);
      if (linkError) {
        console.error("[/api/auth/reset-password] worker link failed:", linkError.message);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
