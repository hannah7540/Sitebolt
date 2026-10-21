"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  completeSubcontractorOnboarding,
  fetchInvitedSubcontractorByEmail,
  SUBCONTRACTOR_DASHBOARD_PATH,
  type InvitedSubcontractor,
} from "@/lib/subcontractor-onboarding";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

export default function SubcontractorOnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() ?? "";

  const [invite, setInvite] = useState<InvitedSubcontractor | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [address, setAddress] = useState("");
  const [abn, setAbn] = useState("");
  const [plExpiry, setPlExpiry] = useState("");
  const [plValue, setPlValue] = useState("");
  const [plFile, setPlFile] = useState<File | null>(null);
  const [piExpiry, setPiExpiry] = useState("");
  const [piValue, setPiValue] = useState("");
  const [piFile, setPiFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingInvite(true);
      const result = await fetchInvitedSubcontractorByEmail(email);
      if (cancelled) return;
      setInvite(result.record);
      setInviteError(result.error);
      setLoadingInvite(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await completeSubcontractorOnboarding({
      email,
      password,
      address,
      abn,
      plExpiry,
      plValue,
      plFile,
      piExpiry,
      piValue,
      piFile,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace(SUBCONTRACTOR_DASHBOARD_PATH);
  };

  if (loadingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-orange-500" />
        Loading invite…
      </div>
    );
  }

  if (inviteError || !invite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className={`${cardClass} max-w-lg p-8`}>
          <h1 className="text-xl font-bold text-slate-900">Invite not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            {inviteError ?? "This onboarding link is invalid or has expired."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="mx-auto w-full max-w-3xl space-y-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            SiteBolt
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Subcontractor <span className="text-orange-500">Onboarding</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Complete account setup for <strong>{invite.company_name}</strong> (
            {email || invite.email}).
          </p>
        </div>

        <section className={`${cardClass} space-y-4 p-6`}>
          <h2 className="text-lg font-bold text-slate-900">Account Setup</h2>
          <label className="block space-y-1">
            <span className={labelClass}>Email</span>
            <input className={inputClass} type="email" value={email} readOnly />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Create password *</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Confirm password *</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          </div>
        </section>

        <section className={`${cardClass} space-y-4 p-6`}>
          <h2 className="text-lg font-bold text-slate-900">Company Details</h2>
          <label className="block space-y-1">
            <span className={labelClass}>Full Address *</span>
            <textarea
              className={`${inputClass} min-h-[80px] resize-y`}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>ABN *</span>
            <input
              className={inputClass}
              value={abn}
              onChange={(event) => setAbn(event.target.value)}
              required
            />
          </label>
        </section>

        <section className={`${cardClass} space-y-4 p-6`}>
          <h2 className="text-lg font-bold text-slate-900">Public Liability (PL) Insurance</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Expiry Date *</span>
              <input
                className={inputClass}
                type="date"
                value={plExpiry}
                onChange={(event) => setPlExpiry(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Policy Value *</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={plValue}
                onChange={(event) => setPlValue(event.target.value)}
                placeholder="e.g. 20000000"
                required
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Certificate upload *</span>
            <input
              className={inputClass}
              type="file"
              accept=".pdf,image/*"
              onChange={(event) => setPlFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
        </section>

        <section className={`${cardClass} space-y-4 p-6`}>
          <h2 className="text-lg font-bold text-slate-900">
            Professional Indemnity (PI) Insurance
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Expiry Date *</span>
              <input
                className={inputClass}
                type="date"
                value={piExpiry}
                onChange={(event) => setPiExpiry(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Policy Value *</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={piValue}
                onChange={(event) => setPiValue(event.target.value)}
                placeholder="e.g. 5000000"
                required
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Certificate upload *</span>
            <input
              className={inputClass}
              type="file"
              accept=".pdf,image/*"
              onChange={(event) => setPiFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
        </section>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Complete onboarding
        </button>
      </form>
    </div>
  );
}
