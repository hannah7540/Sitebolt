"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  completeHiredLabourOnboarding,
  HIRED_LABOUR_DASHBOARD_PATH,
  isHiredLabourWorker,
} from "@/lib/hired-labour";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { fetchAuthenticatedWorkerById, type Worker } from "@/lib/supabase";
import { redirectToLogin } from "@/lib/auth-guard";
import { inputClass, labelClass } from "@/lib/ui-classes";

function HiredLabourOnboardingForm() {
  const router = useRouter();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteCardProvided, setWhiteCardProvided] = useState(false);
  const [silicaCertProvided, setSilicaCertProvided] = useState(false);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");
  const [whiteCardFile, setWhiteCardFile] = useState<File | null>(null);
  const [silicaCertFile, setSilicaCertFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const session = await resolveAuthWorkerFromSession();
      if (!session.hasSession || !session.workerId) {
        redirectToLogin(router, "/onboarding/hired-labour");
        return;
      }
      const row = await fetchAuthenticatedWorkerById(session.workerId);
      if (cancelled) return;
      if (!row || !isHiredLabourWorker(row)) {
        router.replace("/worker-dashboard");
        return;
      }
      if (row.onboarding_completed) {
        router.replace(HIRED_LABOUR_DASHBOARD_PATH);
        return;
      }
      setWorker(row);
      setWhiteCardProvided(row.white_card_provided === true);
      setSilicaCertProvided(row.silica_cert_provided === true);
      setEmergencyContactName(row.emergency_contact_name ?? "");
      setEmergencyContactNumber(row.emergency_contact_number ?? row.emergency_contact_phone ?? "");
      setEmergencyContactRelationship(row.emergency_contact_relationship ?? "");
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!worker) return;
    setSubmitting(true);
    setError(null);
    const result = await completeHiredLabourOnboarding({
      workerId: worker.id,
      whiteCardProvided,
      silicaCertProvided,
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      whiteCardFile,
      silicaCertFile,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace(HIRED_LABOUR_DASHBOARD_PATH);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mx-auto w-full max-w-lg space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            Hired labour
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Complete onboarding</h1>
          <p className="mt-2 text-sm text-slate-600">
            Confirm your White Card and Silica certificate, then add an emergency contact
            before using the app.
          </p>
        </div>

        {error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        ) : null}

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={whiteCardProvided}
            onChange={(event) => setWhiteCardProvided(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">White Card provided</span>
            <span className="text-xs text-slate-500">I hold a current White Card.</span>
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>White Card upload (optional)</span>
          <input
            type="file"
            accept="image/*,.pdf"
            className={inputClass}
            onChange={(event) => setWhiteCardFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={silicaCertProvided}
            onChange={(event) => setSilicaCertProvided(event.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Silica certificate provided
            </span>
            <span className="text-xs text-slate-500">I hold a current silica awareness certificate.</span>
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>Silica certificate upload (optional)</span>
          <input
            type="file"
            accept="image/*,.pdf"
            className={inputClass}
            onChange={(event) => setSilicaCertFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Emergency contact name</span>
          <input
            className={inputClass}
            value={emergencyContactName}
            onChange={(event) => setEmergencyContactName(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className={labelClass}>Emergency contact number</span>
          <input
            type="tel"
            className={inputClass}
            value={emergencyContactNumber}
            onChange={(event) => setEmergencyContactNumber(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className={labelClass}>Relationship</span>
          <input
            className={inputClass}
            value={emergencyContactRelationship}
            onChange={(event) => setEmergencyContactRelationship(event.target.value)}
            required
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Complete onboarding
        </button>
      </form>
    </div>
  );
}

export default function HiredLabourOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <HiredLabourOnboardingForm />
    </Suspense>
  );
}
