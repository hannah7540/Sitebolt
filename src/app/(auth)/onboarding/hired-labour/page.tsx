"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldX } from "lucide-react";
import {
  fetchHiredLabourAccess,
  HIRED_LABOUR_DASHBOARD_PATH,
  isHiredLabourWorker,
  mutateHiredLabour,
  uploadHiredLabourDocument,
} from "@/lib/hired-labour";
import type { HiredLabourStatus } from "@/lib/hired-labour-status";
import {
  resolveAuthWorkerFromSession,
  WORKER_PROFILE_NOT_LINKED_MESSAGE,
} from "@/lib/auth-profile";
import { fetchAuthenticatedWorkerById, type Worker } from "@/lib/supabase";
import { redirectToLogin } from "@/lib/auth-guard";
import HiredLabourCertCapture from "@/components/onboarding/HiredLabourCertCapture";
import { inputClass, labelClass } from "@/lib/ui-classes";

function HiredLabourOnboardingForm() {
  const router = useRouter();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [status, setStatus] = useState<HiredLabourStatus>("invited");
  const [rejectionNotes, setRejectionNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whiteCardNumber, setWhiteCardNumber] = useState("");
  const [whiteCardDate, setWhiteCardDate] = useState("");
  const [whiteCardFile, setWhiteCardFile] = useState<File | null>(null);
  const [silicaCertNumber, setSilicaCertNumber] = useState("");
  const [silicaCertDate, setSilicaCertDate] = useState("");
  const [silicaCertFile, setSilicaCertFile] = useState<File | null>(null);
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const session = await resolveAuthWorkerFromSession();
      if (!session.hasSession) {
        redirectToLogin(router, "/onboarding/hired-labour");
        return;
      }
      if (!session.workerId) {
        if (!cancelled) {
          setError(WORKER_PROFILE_NOT_LINKED_MESSAGE);
          setLoading(false);
        }
        return;
      }
      const row = await fetchAuthenticatedWorkerById(session.workerId);
      if (cancelled) return;
      if (!row || !isHiredLabourWorker(row)) {
        router.replace("/worker-dashboard");
        return;
      }
      const access = await fetchHiredLabourAccess(row.id);
      if (cancelled) return;
      if (access === "approved") {
        router.replace(HIRED_LABOUR_DASHBOARD_PATH);
        return;
      }
      setWorker(row);
      setStatus(access);
      setRejectionNotes(row.rejection_notes ?? null);
      setWhiteCardNumber(row.white_card_number ?? "");
      setWhiteCardDate((row.white_card_date ?? row.white_card_issue_date ?? "").slice(0, 10));
      setSilicaCertNumber(row.silica_cert_number ?? "");
      setSilicaCertDate((row.silica_cert_date ?? row.silica_cert_issue_date ?? "").slice(0, 10));
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

    const existingWhiteCard = worker.white_card_file_url ?? worker.white_card_doc_url ?? "";
    const existingSilica = worker.silica_cert_file_url ?? worker.silica_cert_doc_url ?? "";
    let whiteCardFileUrl = existingWhiteCard;
    let silicaCertFileUrl = existingSilica;

    if (whiteCardFile) {
      const uploaded = await uploadHiredLabourDocument(
        whiteCardFile,
        `workers/${worker.id}/white-card`
      );
      if (uploaded.error || !uploaded.url) {
        setSubmitting(false);
        setError(uploaded.error ?? "White Card upload failed.");
        return;
      }
      whiteCardFileUrl = uploaded.url;
    }
    if (silicaCertFile) {
      const uploaded = await uploadHiredLabourDocument(
        silicaCertFile,
        `workers/${worker.id}/silica-cert`
      );
      if (uploaded.error || !uploaded.url) {
        setSubmitting(false);
        setError(uploaded.error ?? "Silica certificate upload failed.");
        return;
      }
      silicaCertFileUrl = uploaded.url;
    }

    if (!whiteCardFileUrl || !silicaCertFileUrl) {
      setSubmitting(false);
      setError("Upload both the White Card and the Silica certificate.");
      return;
    }

    const result = await mutateHiredLabour({
      action: "submit",
      workerId: worker.id,
      whiteCardNumber,
      whiteCardDate,
      whiteCardFileUrl,
      silicaCertNumber,
      silicaCertDate,
      silicaCertFileUrl,
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setStatus("pending_approval");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error && !worker) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <ShieldX className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Unable to open profile</h1>
          <p role="alert" className="mt-2 text-sm text-slate-600">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <ShieldX className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Access Revoked</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your hired labour access has been revoked. Contact your administrator if this is a mistake.
          </p>
        </div>
      </div>
    );
  }

  if (status === "pending_approval") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Pending Admin Approval</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your documents have been submitted. You can use SiteBolt after an administrator approves your profile.
          </p>
        </div>
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
            Add your White Card, Silica certificate, and emergency contact. An administrator
            will review them before your access is turned on.
          </p>
        </div>

        {status === "rejected" && rejectionNotes ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
            <p className="font-semibold">Your submission was rejected</p>
            <p className="mt-1">{rejectionNotes}</p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        ) : null}

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">White Card</p>
          <label className="block">
            <span className={labelClass}>Number</span>
            <input className={inputClass} value={whiteCardNumber} onChange={(event) => setWhiteCardNumber(event.target.value)} required />
          </label>
          <label className="block">
            <span className={labelClass}>Date</span>
            <input type="date" className={inputClass} value={whiteCardDate} onChange={(event) => setWhiteCardDate(event.target.value)} required />
          </label>
          <HiredLabourCertCapture
            file={whiteCardFile}
            onFileChange={setWhiteCardFile}
            existingUrl={worker?.white_card_file_url ?? worker?.white_card_doc_url ?? null}
          />
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm font-semibold text-slate-900">Silica certificate</p>
          <label className="block">
            <span className={labelClass}>Number</span>
            <input className={inputClass} value={silicaCertNumber} onChange={(event) => setSilicaCertNumber(event.target.value)} required />
          </label>
          <label className="block">
            <span className={labelClass}>Date</span>
            <input type="date" className={inputClass} value={silicaCertDate} onChange={(event) => setSilicaCertDate(event.target.value)} required />
          </label>
          <HiredLabourCertCapture
            file={silicaCertFile}
            onFileChange={setSilicaCertFile}
            existingUrl={worker?.silica_cert_file_url ?? worker?.silica_cert_doc_url ?? null}
          />
        </div>

        <label className="block">
          <span className={labelClass}>Emergency contact name</span>
          <input className={inputClass} value={emergencyContactName} onChange={(event) => setEmergencyContactName(event.target.value)} required />
        </label>
        <label className="block">
          <span className={labelClass}>Emergency contact number</span>
          <input type="tel" className={inputClass} value={emergencyContactNumber} onChange={(event) => setEmergencyContactNumber(event.target.value)} required />
        </label>
        <label className="block">
          <span className={labelClass}>Relationship</span>
          <input className={inputClass} value={emergencyContactRelationship} onChange={(event) => setEmergencyContactRelationship(event.target.value)} required />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Submit for approval
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
