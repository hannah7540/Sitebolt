"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  fetchWorkers,
  isSupabaseConfigured,
  type Worker,
} from "@/lib/supabase";
import { DATABASE_CONNECTION_ERROR_MESSAGE } from "@/lib/project-resolver";
import WorkerDashboardView from "@/components/workers/WorkerDashboardView";
import { cardClass } from "@/lib/ui-classes";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { redirectToLogin } from "@/lib/auth-guard";
import { shouldSkipAuthRedirect } from "@/lib/public-auth-paths";
import { isNativeMobileApp } from "@/lib/native-app";
import {
  canAccessAdminConsole,
  normalizeSecurityRole,
} from "@/lib/security-roles";
import {
  DASHBOARD_LOADING_TIMEOUT_MS,
  getAdminWorkerId,
  resolveDashboardWorkerId,
  workerDashboardUrl,
} from "@/lib/user-session";

function WorkerDashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryWorkerId = searchParams.get("worker_id");
  const fromAdmin = searchParams.get("from") === "admin";
  const showWelcome = searchParams.get("welcome") === "1";

  const [workerId, setWorkerId] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sessionWorkers, setSessionWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function resolveWorkerId() {
      try {
        setFetchError(null);

        if (!isSupabaseConfigured()) {
          if (!cancelled) setPickerLoading(false);
          return;
        }

        const authSession = await resolveAuthWorkerFromSession();
        if (!authSession.hasSession) {
          if (shouldSkipAuthRedirect()) return;
          redirectToLogin(router, `/worker-dashboard${queryWorkerId ? `?worker_id=${queryWorkerId}` : ""}`);
          return;
        }

        const workerData = await fetchWorkers();
        if (!cancelled) setSessionWorkers(workerData);

        const sessionWorker =
          authSession.workerId != null
            ? workerData.find((worker) => worker.id === authSession.workerId) ??
              null
            : null;
        const sessionRole = normalizeSecurityRole(sessionWorker?.security_role);

        if (
          sessionWorker &&
          canAccessAdminConsole(sessionRole) &&
          !fromAdmin &&
          !queryWorkerId &&
          !isNativeMobileApp()
        ) {
          router.replace("/");
          return;
        }

        let resolved = await resolveDashboardWorkerId({
          queryWorkerId,
          preferAdmin: fromAdmin,
          sessionWorkerId: authSession.workerId,
        });

        if (
          sessionWorker &&
          sessionRole === "general_worker" &&
          resolved &&
          resolved !== sessionWorker.id
        ) {
          resolved = sessionWorker.id;
          router.replace(workerDashboardUrl(sessionWorker.id));
        }

        if (cancelled) return;

        if (resolved) {
          setWorkerId(resolved);
          if (fromAdmin && queryWorkerId?.trim()) {
            router.replace(workerDashboardUrl(resolved, { fromAdmin: true }));
          }
        } else {
          setFetchError(
            "No worker profile is linked to your account. Contact your administrator."
          );
        }
      } catch (error) {
        console.error("Worker dashboard profile resolution failed:", error);
        if (!cancelled) {
          setFetchError(DATABASE_CONNECTION_ERROR_MESSAGE);
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }

    const timeout = window.setTimeout(() => {
      if (!cancelled) setPickerLoading(false);
    }, DASHBOARD_LOADING_TIMEOUT_MS);

    resolveWorkerId();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [queryWorkerId, fromAdmin, router]);

  const showAdminSwitch =
    !isNativeMobileApp() && (fromAdmin || (!!workerId && getAdminWorkerId() === workerId));

  if (pickerLoading && !workerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!workerId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
        <div className={`w-full max-w-md space-y-4 p-6 ${cardClass}`}>
          <h1 className="text-xl font-bold text-slate-900">Worker Dashboard</h1>
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {fetchError ??
              "Unable to open a worker profile. Check your Supabase connection and try again."}
          </p>
        </div>
      </div>
    );
  }

  const linkedWorker = sessionWorkers.find((worker) => worker.id === workerId);
  const sessionRole = normalizeSecurityRole(linkedWorker?.security_role);

  return (
    <>
      {showWelcome ? (
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Welcome to SiteBolt! Your account setup is complete.
          </p>
        </div>
      ) : null}
      <WorkerDashboardView
        workerId={workerId}
        showAdminSwitch={showAdminSwitch}
        preferAdminProfile={fromAdmin}
        sessionRole={sessionRole}
      />
    </>
  );
}

export default function WorkerDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-transparent">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <WorkerDashboardContent />
    </Suspense>
  );
}
