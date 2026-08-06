"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase";
import { DATABASE_CONNECTION_ERROR_MESSAGE } from "@/lib/project-resolver";
import WorkerDashboardView from "@/components/workers/WorkerDashboardView";
import { cardClass } from "@/lib/ui-classes";
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

  const [workerId, setWorkerId] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function resolveWorkerId() {
      try {
        setFetchError(null);

        if (!isSupabaseConfigured()) {
          if (!cancelled) setPickerLoading(false);
          return;
        }

        const resolved = await resolveDashboardWorkerId({
          queryWorkerId,
          preferAdmin: fromAdmin,
        });

        if (cancelled) return;

        if (resolved) {
          setWorkerId(resolved);
          if (fromAdmin && queryWorkerId?.trim()) {
            router.replace(workerDashboardUrl(resolved, { fromAdmin: true }));
          }
        } else {
          setFetchError(
            "No worker profiles are available yet. Add a worker in the admin console first."
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
    fromAdmin || (!!workerId && getAdminWorkerId() === workerId);

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

  return (
    <WorkerDashboardView
      workerId={workerId}
      showAdminSwitch={showAdminSwitch}
      preferAdminProfile={fromAdmin}
    />
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
