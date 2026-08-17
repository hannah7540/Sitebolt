export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { processDueScheduledEmailsAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";

export async function POST() {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const result = await processDueScheduledEmailsAdmin(auth.admin);
  return NextResponse.json({ processed: result.processed, errors: result.errors });
}
