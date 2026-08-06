import { NextResponse } from "next/server";
import { runExpiryAlertCheck } from "@/lib/expiry-alerts";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === secret) return true;

  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runExpiryAlertCheck();
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

  const result = await runExpiryAlertCheck({ force });
  return NextResponse.json(result);
}
