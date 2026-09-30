"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { isNativeMobileApp } from "@/lib/native-app";
import {
  buildWorkerDeepLinkPath,
  parseWorkerDeepLink,
  type WorkerDeepLinkTarget,
} from "@/lib/worker-deep-links";
import { getStoredWorkerId } from "@/lib/user-session";

type PushPayload = {
  open?: string;
  deep_link?: string;
  target?: string;
  id?: string;
  assignmentId?: string;
  assignment_id?: string;
  worker_id?: string;
  title?: string;
  body?: string;
};

function payloadToParams(data: PushPayload | null | undefined): Record<string, string> {
  if (!data || typeof data !== "object") return {};
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.trim()) {
      params[key] = value.trim();
    }
  }
  return params;
}

function resolveTargetFromNotification(
  notification: { data?: unknown; title?: string; body?: string } | null | undefined
): WorkerDeepLinkTarget | null {
  const data =
    notification?.data && typeof notification.data === "object"
      ? (notification.data as PushPayload)
      : null;
  return parseWorkerDeepLink(payloadToParams(data));
}

function isNativeCapacitorPlatform(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor;
    if (typeof capacitor?.isNativePlatform === "function") {
      return capacitor.isNativePlatform();
    }
  } catch {
    return false;
  }
  return isNativeMobileApp();
}

/** Load the native plugin only inside Capacitor; skip on web / Vercel. */
async function loadPushNotificationsApi() {
  if (!isNativeCapacitorPlatform()) return null;
  try {
    const loaded = await import("@capacitor/push-notifications");
    return loaded.PushNotifications;
  } catch {
    return null;
  }
}

/**
 * Registers for native push notifications and deep-links taps into the
 * worker dashboard (SWMS, inductions, forms, etc.).
 */
export default function WorkerPushNotifications() {
  const router = useRouter();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!isNativeCapacitorPlatform() || registeredRef.current) return;
    registeredRef.current = true;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        const PushNotifications = await loadPushNotificationsApi();
        if (cancelled) return;
        if (!PushNotifications) {
          console.info("[WorkerPush] Plugin not available; skipping registration");
          return;
        }

        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== "granted") {
          console.info("[WorkerPush] Notification permission not granted");
          return;
        }

        await PushNotifications.register();

        const registration = await PushNotifications.addListener(
          "registration",
          (token) => {
            const value = token.value?.trim();
            if (!value) return;
            console.info("[WorkerPush] Device token registered", value.slice(0, 12));
            try {
              window.localStorage.setItem("sitebolt_push_token", value);
            } catch {
              /* ignore storage failures */
            }
          }
        );
        cleanups.push(() => void registration.remove());

        const registrationError = await PushNotifications.addListener(
          "registrationError",
          (error) => {
            console.error("[WorkerPush] Registration error", error);
          }
        );
        cleanups.push(() => void registrationError.remove());

        const received = await PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            console.info(
              "[WorkerPush] Foreground notification",
              notification.title ?? notification.body
            );
            window.dispatchEvent(
              new CustomEvent("sitebolt:worker-push", {
                detail: {
                  title: notification.title,
                  body: notification.body,
                  data: notification.data,
                },
              })
            );
          }
        );
        cleanups.push(() => void received.remove());

        const action = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (event) => {
            const target = resolveTargetFromNotification(event.notification);
            if (!target) return;
            const workerId =
              (event.notification?.data as PushPayload | undefined)?.worker_id ??
              getStoredWorkerId();
            router.push(buildWorkerDeepLinkPath(target, workerId));
          }
        );
        cleanups.push(() => void action.remove());
      } catch (error) {
        console.warn("[WorkerPush] Push notifications unavailable", error);
      }
    })();

    return () => {
      cancelled = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, [router]);

  return null;
}
