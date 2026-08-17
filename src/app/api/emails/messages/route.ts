export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { fetchEmailMessagesAdmin } from "@/lib/email-module-admin";
import { requireEmailsApiAccess } from "@/lib/email-module-auth";
import type { EmailFolder } from "@/lib/email-module-types";

export async function GET(request: Request) {
  const auth = await requireEmailsApiAccess();
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const folder = (params.get("folder") ?? "inbox") as EmailFolder;

  const result = await fetchEmailMessagesAdmin(auth.admin, {
    folder,
    search: params.get("search") ?? undefined,
    dateFrom: params.get("dateFrom"),
    dateTo: params.get("dateTo"),
    projectId: params.get("projectId"),
    workerId: params.get("workerId"),
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ messages: result.messages });
}
