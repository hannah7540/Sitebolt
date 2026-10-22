export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireHeaderNotificationAccess } from "@/lib/header-notifications-auth";
import {
  fetchHeaderNotificationInbox,
  type HeaderNotificationType,
} from "@/lib/header-notifications";

function parseType(value: string | null): HeaderNotificationType | null {
  return value === "sms" || value === "email" ? value : null;
}

export async function GET(request: Request) {
  const auth = await requireHeaderNotificationAccess();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const type = parseType(url.searchParams.get("type"));
  if (!type) {
    return NextResponse.json({ error: "type must be sms or email." }, { status: 400 });
  }

  const inbox = await fetchHeaderNotificationInbox(auth.admin, auth.user.id, type);
  return NextResponse.json({
    count: inbox.count,
    items: inbox.items,
  });
}
