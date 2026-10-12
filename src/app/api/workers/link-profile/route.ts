export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { linkWorkerProfile } from "@/lib/link-worker-profile";
import { emailsMatchExactly } from "@/lib/worker-auth-lookup";

async function resolveAuthenticatedUser(req: Request): Promise<User | null> {
  const admin = createSupabaseAdminClient();
  const authHeader = req.headers.get("authorization");
  const token =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) {
      return data.user;
    }
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  return user;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const user = await resolveAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const email = user.email?.trim() ?? "";
  if (!email) {
    return NextResponse.json(
      { error: "Auth user email is required." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const bodyEmail =
    body && typeof body === "object" && typeof body.email === "string"
      ? body.email
      : "";
  const bodyAuthId =
    body && typeof body === "object" && typeof body.authId === "string"
      ? body.authId
      : "";

  if (bodyEmail && !emailsMatchExactly(bodyEmail, email)) {
    return NextResponse.json(
      { error: "Email does not match the authenticated session." },
      { status: 403 }
    );
  }
  if (bodyAuthId && bodyAuthId.trim() !== user.id) {
    return NextResponse.json(
      { error: "Auth id does not match the authenticated session." },
      { status: 403 }
    );
  }

  const result = await linkWorkerProfile(email, user.id);
  if (result.error || !result.workerId) {
    return NextResponse.json(
      { error: result.error ?? "Worker profile not found." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    workerId: result.workerId,
    organisationId: result.organisationId,
    securityRole: result.securityRole,
  });
}
