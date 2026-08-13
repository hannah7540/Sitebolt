"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { workerDashboardUrl } from "@/lib/user-session";
import type { WorkerOnboardingRecord } from "@/lib/worker-onboarding";

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error.trim() : null;
}

export default function OnboardingForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [whiteCardNumber, setWhiteCardNumber] = useState("");
  const [driversLicenceNumber, setDriversLicenceNumber] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadWorker() {
      try {
        const response = await fetch("/api/workers/onboarding");
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          if (!cancelled) {
            setError(parseApiError(payload) ?? "Unable to load your worker profile.");
            setLoading(false);
          }
          return;
        }

        const worker = (payload as { worker?: WorkerOnboardingRecord }).worker;
        if (!worker) {
          if (!cancelled) {
            setError("Worker profile not found.");
            setLoading(false);
          }
          return;
        }

        if (worker.onboarding_completed) {
          router.replace(`${workerDashboardUrl(worker.id)}&welcome=1`);
          return;
        }

        if (!cancelled) {
          setWorkerId(worker.id);
          setFullName(getWorkerDisplayName(worker, ""));
          setPhone(worker.phone ?? "");
          setTrade(worker.trade ?? "");
          setEmergencyContactName(worker.emergency_contact_name ?? "");
          setEmergencyContactPhone(worker.emergency_contact_phone ?? "");
          setWhiteCardNumber(worker.white_card_number ?? "");
          setDriversLicenceNumber(worker.drivers_licence_number ?? "");
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load onboarding.");
          setLoading(false);
        }
      }
    }

    void loadWorker();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/workers/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          trade,
          emergencyContactName,
          emergencyContactPhone,
          whiteCardNumber,
          driversLicenceNumber,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(parseApiError(payload) ?? "Failed to save your details.");
        return;
      }

      const savedWorkerId =
        payload &&
        typeof payload === "object" &&
        "workerId" in payload &&
        typeof payload.workerId === "string"
          ? payload.workerId
          : workerId;

      router.replace(
        savedWorkerId
          ? `${workerDashboardUrl(savedWorkerId)}&welcome=1`
          : "/worker-dashboard?welcome=1"
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save your details.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className={cardClass + " w-full max-w-2xl p-8"}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              SiteBolt
            </p>
            <h1 className="text-xl font-bold text-slate-900">Complete Your Account Setup</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600">
          Welcome to SiteBolt. Please confirm your details below so your team can reach you
          and keep your compliance records up to date.
        </p>

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-1 sm:col-span-2">
            <label htmlFor="onboarding-full-name" className={labelClass}>
              Full Name
            </label>
            <input
              id="onboarding-full-name"
              type="text"
              className={inputClass}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="onboarding-phone" className={labelClass}>
              Phone Number
            </label>
            <input
              id="onboarding-phone"
              type="tel"
              className={inputClass}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="onboarding-trade" className={labelClass}>
              Trade / Role
            </label>
            <input
              id="onboarding-trade"
              type="text"
              className={inputClass}
              value={trade}
              onChange={(event) => setTrade(event.target.value)}
              placeholder="e.g. Electrician"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="onboarding-emergency-name" className={labelClass}>
              Emergency Contact Name
            </label>
            <input
              id="onboarding-emergency-name"
              type="text"
              className={inputClass}
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="onboarding-emergency-phone" className={labelClass}>
              Emergency Contact Phone
            </label>
            <input
              id="onboarding-emergency-phone"
              type="tel"
              className={inputClass}
              value={emergencyContactPhone}
              onChange={(event) => setEmergencyContactPhone(event.target.value)}
              autoComplete="tel"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="onboarding-white-card" className={labelClass}>
              White Card Number
            </label>
            <input
              id="onboarding-white-card"
              type="text"
              className={inputClass}
              value={whiteCardNumber}
              onChange={(event) => setWhiteCardNumber(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="onboarding-licence" className={labelClass}>
              Driver&apos;s Licence Number
            </label>
            <input
              id="onboarding-licence"
              type="text"
              className={inputClass}
              value={driversLicenceNumber}
              onChange={(event) => setDriversLicenceNumber(event.target.value)}
            />
          </div>

          {typeof error === "string" && error ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 sm:col-span-2">
              {error}
            </div>
          ) : null}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving your details…
                </>
              ) : (
                "Complete setup"
              )}
            </button>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Need help?{" "}
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            Contact your administrator
          </Link>
        </p>
      </div>
    </div>
  );
}
