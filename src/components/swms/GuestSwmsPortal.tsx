"use client";

import { useState } from "react";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import {
  lookupPendingGuestSwms,
  submitGuestSwmsSignature,
} from "@/app/actions/swms-guest";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import MobileFriendlyPdfViewer from "@/components/ui/MobileFriendlyPdfViewer";
import { isValidGuestEmail, type GuestPendingSwmsItem } from "@/lib/swms-guest";
import { inputClass, labelClass } from "@/lib/ui-classes";

type Step = "email" | "list" | "sign";

export default function GuestSwmsPortal() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<GuestPendingSwmsItem[]>([]);
  const [selected, setSelected] = useState<GuestPendingSwmsItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!isValidGuestEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    const result = await lookupPendingGuestSwms(email);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAssignments(result.assignments);
    setStep("list");
  };

  const openSign = (item: GuestPendingSwmsItem) => {
    setSelected(item);
    setGuestName("");
    setSignatureData(null);
    setError(null);
    setSuccess(null);
    setStep("sign");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setError(null);
    if (!guestName.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!signatureData?.startsWith("data:image")) {
      setError("Please sign before submitting.");
      return;
    }

    setSaving(true);
    const result = await submitGuestSwmsSignature({
      assignmentId: selected.id,
      guestEmail: email,
      guestName,
      signatureData,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    const remaining = assignments.filter((row) => row.id !== selected.id);
    setAssignments(remaining);
    setSelected(null);
    setSuccess(`Thank you. You have signed “${selected.swmsTitle}”.`);
    setStep("list");
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
          SiteBolt
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Guest SWMS Portal</h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the email address the SWMS was sent to, then review and sign.
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}

      {step === "email" ? (
        <form
          onSubmit={(event) => void handleLookup(event)}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block space-y-1">
            <span className={labelClass}>Email address</span>
            <input
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            View pending SWMS
          </button>
        </form>
      ) : null}

      {step === "list" ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
              setSuccess(null);
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Use a different email
          </button>

          {assignments.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              No pending SWMS for this email address.
            </div>
          ) : (
            <ul className="space-y-3">
              {assignments.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openSign(item)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-orange-200 hover:bg-orange-50/40"
                  >
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                    <span>
                      <span className="block font-semibold text-slate-900">
                        {item.swmsTitle}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {item.version ? `Version ${item.version}` : "Pending signature"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {step === "sign" && selected ? (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <button
            type="button"
            onClick={() => {
              setStep("list");
              setSelected(null);
              setError(null);
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </button>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selected.swmsTitle}</h2>
            {selected.version ? (
              <p className="text-sm text-slate-500">Version {selected.version}</p>
            ) : null}
          </div>

          {selected.swmsDocumentUrl ? (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <MobileFriendlyPdfViewer
                documentUrl={selected.swmsDocumentUrl}
                title={selected.swmsTitle}
              />
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className={labelClass}>Your name</span>
            <input
              type="text"
              className={inputClass}
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Full name"
              autoComplete="name"
              required
            />
          </label>

          <div className="space-y-1">
            <span className={labelClass}>Signature</span>
            <SignatureCanvas
              key={selected.id}
              onChange={(dataUrl) => setSignatureData(dataUrl)}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit signature
          </button>
        </form>
      ) : null}
    </div>
  );
}
