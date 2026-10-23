export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { runDailyComplianceReminders } from "@/lib/compliance-cron-engine";

/**
 * Daily Vercel cron: remind workers about SWMS/inductions that are still
 * pending 7 days after assignment. Immediate assignment emails are disabled
 * during onboarding — only the set-password invite is sent then.
 *
 * Auth: Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === secret) return true;

  return false;
}

async function runReminders() {
  if (!isSupabaseAdminConfigured()) {
    return {
      skipped: true,
      reason: "Server admin client is not configured.",
      swmsReminded: 0,
      inductionReminded: 0,
      vocReminded: 0,
      licenceReminded: 0,
      emailed: 0,
      sms: 0,
      notified: 0,
      errors: ["Server admin client is not configured."],
    };
  }

  // Service-role client bypasses RLS so every tenant's pending rows are visible.
  const admin = createSupabaseAdminClient();
  const result = await runDailyComplianceReminders(admin);
  return { skipped: false, ...result };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runReminders();
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runReminders();
  return NextResponse.json(result);
}
