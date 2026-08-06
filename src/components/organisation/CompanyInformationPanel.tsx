"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import {
  fetchCompanyProfile,
  upsertCompanyProfile,
} from "@/lib/supabase";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import CompanyLogoPanel from "./CompanyLogoPanel";

export default function CompanyInformationPanel() {
  const [companyName, setCompanyName] = useState("");
  const [abn, setAbn] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyProfile().then((profile) => {
      if (profile) {
        setCompanyName(profile.company_name ?? "");
        setAbn(profile.abn ?? "");
        setAddress(profile.address ?? "");
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    const { error: saveError } = await upsertCompanyProfile({
      company_name: companyName,
      abn,
      address,
    });

    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    setMessage("Company profile saved.");
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

      <form onSubmit={handleSave} className={`max-w-xl space-y-4 p-6 ${cardClass}`}>
        <label className="block space-y-1">
          <span className={labelClass}>Company name</span>
          <input
            className={inputClass}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
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
          <span className={labelClass}>Address</span>
          <textarea
            className={`${inputClass} min-h-[96px] resize-y`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, suburb, state, postcode"
          />
        </label>

        {message && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        )}
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
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
    </div>
  );
}
