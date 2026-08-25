import { NextResponse } from "next/server";
import { runExpiryAlertCheck, ORGANISATION_ALERT_THRESHOLDS } from "@/lib/expiry-alerts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === secret) return true;

  return false;
}

async function runCheck(force = false) {
  try {
    const admin = isSupabaseAdminConfigured()
      ? createSupabaseAdminClient()
      : undefined;
    return await runExpiryAlertCheck({ force, admin });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Alert check failed unexpectedly.";
    console.error("[api/alerts/check-expiries] failed:", cause);
    return {
      skipped: true,
      reason: message,
      workerItemsIncluded: 0,
      insuranceItemsIncluded: 0,
      complianceItemsIncluded: 0,
      emailsAttempted: 0,
      emailsSent: 0,
      errors: [message],
      thresholds: { ...ORGANISATION_ALERT_THRESHOLDS },
    };
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runCheck(false);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    force = Boolean(body.force);
  } catch {
    force = false;
  }

  const result = await runCheck(force);
  return NextResponse.json(result);
}
