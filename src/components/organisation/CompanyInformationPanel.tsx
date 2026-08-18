"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useCompanyBranding } from "@/components/branding/CompanyBrandingProvider";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  fetchCompanyProfile,
  upsertCompanyProfile,
  type CompanyProfile,
} from "@/lib/supabase";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import CompanyLogoPanel from "./CompanyLogoPanel";

function applyProfileToForm(profile: CompanyProfile) {
  return {
    companyName: profile.company_name ?? "",
    tradingName: profile.trading_name ?? "",
    abn: profile.abn ?? "",
    acn: profile.acn ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    address: profile.address ?? "",
    suburb: profile.suburb ?? "",
    state: profile.state ?? "",
    postcode: profile.postcode ?? "",
  };
}

export default function CompanyInformationPanel() {
  const { refreshBranding } = useCompanyBranding();
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [abn, setAbn] = useState("");
  const [acn, setAcn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await fetchCompanyProfile();
      if (profile) {
        setProfileId(profile.id);
        const values = applyProfileToForm(profile);
        setCompanyName(values.companyName);
        setTradingName(values.tradingName);
        setAbn(values.abn);
        setAcn(values.acn);
        setPhone(values.phone);
        setEmail(values.email);
        setAddress(values.address);
        setSuburb(values.suburb);
        setState(values.state);
        setPostcode(values.postcode);
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load company profile.";
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const { profile, error: saveError } = await upsertCompanyProfile({
        company_name: companyName,
        trading_name: tradingName,
        abn,
        acn,
        phone,
        email,
        address,
        suburb,
        state,
        postcode,
      });

      if (saveError) {
        throw new Error(saveError);
      }

      if (!profile) {
        throw new Error("Failed to save changes");
      }

      setProfileId(profile.id);
      const values = applyProfileToForm(profile);
      setCompanyName(values.companyName);
      setTradingName(values.tradingName);
      setAbn(values.abn);
      setAcn(values.acn);
      setPhone(values.phone);
      setEmail(values.email);
      setAddress(values.address);
      setSuburb(values.suburb);
      setState(values.state);
      setPostcode(values.postcode);

      await refreshBranding();
      showSuccess("Organisation details saved successfully");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to save changes";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading company profile…
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">
        Company <span className="text-orange-500">Information</span>
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Organisation details used across SiteBolt documents and dashboards.
      </p>

      <form onSubmit={handleSave} className={`max-w-3xl space-y-4 p-6 ${cardClass}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1 md:col-span-2">
            <span className={labelClass}>Company name</span>
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </label>

          <label className="block space-y-1 md:col-span-2">
            <span className={labelClass}>Trading name</span>
            <input
              className={inputClass}
              value={tradingName}
              onChange={(e) => setTradingName(e.target.value)}
              placeholder="Optional trading or brand name"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>ABN</span>
            <input
              className={inputClass}
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              placeholder="12 345 678 901"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>ACN</span>
            <input
              className={inputClass}
              value={acn}
              onChange={(e) => setAcn(e.target.value)}
              placeholder="123 456 789"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Phone</span>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Email</span>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="block space-y-1 md:col-span-2">
            <span className={labelClass}>Address</span>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Suburb</span>
            <input
              className={inputClass}
              value={suburb}
              onChange={(e) => setSuburb(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>State</span>
            <input
              className={inputClass}
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="NSW"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Postcode</span>
            <input
              className={inputClass}
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>

        {profileId ? (
          <p className="text-xs text-slate-400">Record ID: {profileId}</p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          aria-busy={saving}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Company Profile
        </button>
      </form>

      <CompanyLogoPanel />

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
