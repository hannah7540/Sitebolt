"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  fetchHeaderInbox,
  type HeaderNotificationInbox,
  type HeaderNotificationType,
} from "@/lib/header-notifications-client";

const EMPTY: HeaderNotificationInbox = { count: 0, items: [], unreadIds: [] };

export function useHeaderNotifications() {
  const [sms, setSms] = useState<HeaderNotificationInbox>(EMPTY);
  const [email, setEmail] = useState<HeaderNotificationInbox>(EMPTY);
  const [allowed, setAllowed] = useState(true);

  const load = useCallback(async () => {
    try {
      const [smsInbox, emailInbox] = await Promise.all([
        fetchHeaderInbox("sms"),
        fetchHeaderInbox("email"),
      ]);
      if (smsInbox === null && emailInbox === null) {
        setAllowed(false);
        setSms(EMPTY);
        setEmail(EMPTY);
        return;
      }
      setAllowed(true);
      if (smsInbox) setSms(smsInbox);
      if (emailInbox) setEmail(emailInbox);
    } catch (cause) {
      console.warn("[header-notifications] load failed:", cause);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 45_000);

    let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
    try {
      supabase = createSupabaseBrowserClient();
    } catch {
      supabase = null;
    }

    const channel = supabase
      ?.channel("header-notification-inbox")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages" },
        () => void load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "email_messages" },
        () => void load()
      )
      .subscribe();

    return () => {
      window.clearInterval(timer);
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [load]);

  const inboxFor = useCallback(
    (type: HeaderNotificationType) => (type === "sms" ? sms : email),
    [sms, email]
  );

  return { allowed, sms, email, inboxFor, refresh: load };
}
