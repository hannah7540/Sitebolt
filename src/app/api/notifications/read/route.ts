export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireHeaderNotificationAccess } from "@/lib/header-notifications-auth";
import {
  clearHeaderNotifications,
  markHeaderNotificationsRead,
  type HeaderNotificationType,
} from "@/lib/header-notifications";

function parseType(value: unknown): HeaderNotificationType | null {
  return value === "sms" || value === "email" ? value : null;
}

export async function POST(request: Request) {
  const auth = await requireHeaderNotificationAccess();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      type?: string;
      messageId?: string;
      clearAll?: boolean;
    };
    const type = parseType(body.type);
    if (!type) {
      return NextResponse.json({ error: "type must be sms or email." }, { status: 400 });
    }

    const result = body.clearAll
      ? await clearHeaderNotifications(auth.admin, auth.user.id, type)
      : await markHeaderNotificationsRead(
          auth.admin,
          auth.user.id,
          type,
          body.messageId ? [body.messageId] : []
        );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ updated: result.updated });
  } catch (cause) {
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : "Failed to update notifications." },
      { status: 500 }
    );
  }
}
