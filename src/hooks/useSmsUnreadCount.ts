"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchUnreadSmsCount } from "@/lib/sms-module-client";

export const SMS_UNREAD_REFRESH_EVENT = "sitebolt:sms-unread-refresh";

export function useSmsUnreadCount(enabled = true): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const next = await fetchUnreadSmsCount();
      setCount(next);
    } catch (cause) {
      console.error("[useSmsUnreadCount] fetch failed:", cause);
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    if (!enabled) return;

    const onRefresh = () => void load();
    window.addEventListener(SMS_UNREAD_REFRESH_EVENT, onRefresh);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.removeEventListener(SMS_UNREAD_REFRESH_EVENT, onRefresh);
      window.clearInterval(timer);
    };
  }, [enabled, load]);

  return count;
}

export function refreshSmsUnreadCount() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SMS_UNREAD_REFRESH_EVENT));
  }
}
