"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { useCompanyBranding } from "@/components/branding/CompanyBrandingProvider";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  uploadOrganisationLogo,
  validateOrganisationLogoFile,
} from "@/lib/company-asset-upload";
import {
  fetchOrganisationFromApi,
  saveOrganisationToApi,
  type OrganisationFormRecord,
} from "@/lib/organisation-api-client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function applyOrganisationRecord(
  record: OrganisationFormRecord,
  setters: {
    setProfileId: (value: string) => void;
    setCompanyName: (value: string) => void;
    setTradingName: (value: string) => void;
    setAbn: (value: string) => void;
    setAcn: (value: string) => void;
    setPhone: (value: string) => void;
    setEmail: (value: string) => void;
    setWebsite: (value: string) => void;
    setAddress: (value: string) => void;
    setSuburb: (value: string) => void;
    setState: (value: string) => void;
    setPostcode: (value: string) => void;
    setCountry: (value: string) => void;
    setLogoUrl: (value: string | null) => void;
  }
) {
  setters.setProfileId(record.id);
  setters.setCompanyName(record.company_name);
  setters.setTradingName(record.trading_name);
  setters.setAbn(record.abn);
  setters.setAcn(record.acn);
  setters.setPhone(record.phone);
  setters.setEmail(record.email);
  setters.setWebsite(record.website);
  setters.setAddress(record.address);
  setters.setSuburb(record.suburb);
  setters.setState(record.state);
  setters.setPostcode(record.postcode);
  setters.setCountry(record.country);
  setters.setLogoUrl(record.logo_url);
}

export default function CompanyInformationPanel() {
  const { refreshBranding } = useCompanyBranding();
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [tradingName, setTradingName] = useState("");
  const [abn, setAbn] = useState("");
  const [acn, setAcn] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState("Australia");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoPreviewVersion, setLogoPreviewVersion] = useState(0);
  const [logoStorageBucket, setLogoStorageBucket] = useState("organisation-logos");
  const logoPreviewBlobRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formSetters = {
    setProfileId,
    setCompanyName,
    setTradingName,
    setAbn,
    setAcn,
    setPhone,
    setEmail,
    setWebsite,
    setAddress,
    setSuburb,
    setState,
    setPostcode,
    setCountry,
    setLogoUrl,
  };

  const buildPayload = useCallback(
    (overrides?: { logo_url?: string | null }) => {
      const resolvedLogo =
        overrides?.logo_url !== undefined ? overrides.logo_url : logoUrl;
      return {
        company_name: companyName,
        trading_name: tradingName,
        abn,
        acn,
        phone,
        email,
        website,
        address,
        street_address: address,
        suburb,
        city: suburb,
        state,
        postcode,
        postal_code: postcode,
        country,
        logo_url: resolvedLogo,
        logo: resolvedLogo,
      };
    },
    [
      companyName,
      tradingName,
      abn,
      acn,
      phone,
      email,
      website,
      address,
      suburb,
      state,
      postcode,
      country,
      logoUrl,
    ]
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { organisation, error: loadError } = await fetchOrganisationFromApi();
      if (loadError) {
        throw new Error(loadError);
      }
      if (organisation) {
        applyOrganisationRecord(organisation, formSetters);
        setLogoPreviewVersion((current) => current + 1);
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

  const persistOrganisation = async (payload: ReturnType<typeof buildPayload>) => {
    const { organisation, error: saveError } = await saveOrganisationToApi(payload);
    if (saveError) {
      throw new Error(saveError);
    }
    if (!organisation) {
      throw new Error("Failed to save organisation details");
    }
    applyOrganisationRecord(organisation, formSetters);
    await refreshBranding();
    return organisation;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await persistOrganisation(buildPayload());
      showSuccess("Organisation details saved successfully");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to save organisation details";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    return () => {
      if (logoPreviewBlobRef.current) {
        URL.revokeObjectURL(logoPreviewBlobRef.current);
      }
    };
  }, []);

  const setLocalLogoPreview = (file: File) => {
    if (logoPreviewBlobRef.current) {
      URL.revokeObjectURL(logoPreviewBlobRef.current);
    }
    const blobUrl = URL.createObjectURL(file);
    logoPreviewBlobRef.current = blobUrl;
    setLogoPreviewUrl(blobUrl);
  };

  const clearLocalLogoPreview = () => {
    if (logoPreviewBlobRef.current) {
      URL.revokeObjectURL(logoPreviewBlobRef.current);
      logoPreviewBlobRef.current = null;
    }
    setLogoPreviewUrl(null);
  };

  const displayLogoSrc =
    logoPreviewUrl ??
    (logoUrl ? `${logoUrl}${logoUrl.includes("?") ? "&" : "?"}t=${logoPreviewVersion}` : null);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateOrganisationLogoFile(file);
    if (validationError) {
      showError(validationError);
      return;
    }

    setLocalLogoPreview(file);
    setUploadingLogo(true);
    setError(null);

    try {
      const { url, error: uploadError, bucket } = await uploadOrganisationLogo(file);
      if (uploadError || !url) {
        throw new Error(uploadError ?? "Logo upload failed.");
      }

      setLogoUrl(url);
      if (bucket) {
        setLogoStorageBucket(bucket);
      }

      await persistOrganisation(buildPayload({ logo_url: url }));
      clearLocalLogoPreview();
      setLogoPreviewVersion((current) => current + 1);
      showSuccess("Logo uploaded and saved successfully");
    } catch (cause) {
      clearLocalLogoPreview();
      const message = cause instanceof Error ? cause.message : "Logo upload failed.";
      setError(message);
      showError(message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setRemovingLogo(true);
    setError(null);

    try {
      clearLocalLogoPreview();
      setLogoUrl(null);
      await persistOrganisation(buildPayload({ logo_url: null }));
      setLogoPreviewVersion((current) => current + 1);
      showSuccess("Company logo removed");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to remove logo.";
      setError(message);
      showError(message);
    } finally {
      setRemovingLogo(false);
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

      <form onSubmit={handleSave} className="max-w-3xl space-y-6">
        <section className={`space-y-4 p-6 ${cardClass}`}>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Company Logo & Branding</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload your organisation logo for headers, safety forms, and printed site packs.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            {displayLogoSrc ? (
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-50 p-2">
                <img
                  src={displayLogoSrc}
                  alt="Company Logo"
                  className="max-h-full max-w-full object-contain"
                  onError={() => {
                    console.error("Failed to load logo image:", displayLogoSrc);
                  }}
                />
                {uploadingLogo ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400">
                <Building2 className="mb-1 h-8 w-8" />
                <span className="text-xs">No Logo</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.png,.jpg,.jpeg,.svg,.webp,.gif"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                disabled={uploadingLogo || removingLogo || saving}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                Upload Logo
              </button>
              {logoUrl || logoPreviewUrl ? (
                <button
                  type="button"
                  disabled={uploadingLogo || removingLogo || saving}
                  onClick={() => void handleRemoveLogo()}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {removingLogo ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remove Logo
                </button>
              ) : null}
            </div>
          </div>

          <p className={labelClass}>
            Stored in Supabase bucket:{" "}
            <span className="font-medium">{logoStorageBucket}</span>
            {logoStorageBucket !== "organisation-logos" ? " (fallback)" : null}
          </p>
        </section>

        <section className={`space-y-4 p-6 ${cardClass}`}>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Company Details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Legal and contact information shown on documents and dashboards.
            </p>
          </div>

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
              <span className={labelClass}>Website</span>
              <input
                className={inputClass}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.example.com.au"
                inputMode="url"
              />
            </label>
          </div>
        </section>

        <section className={`space-y-4 p-6 ${cardClass}`}>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Business Address</h2>
            <p className="mt-1 text-sm text-slate-500">
              Primary business address used on compliance documents.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1 md:col-span-2">
              <span className={labelClass}>Street address</span>
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

            <label className="block space-y-1">
              <span className={labelClass}>Country</span>
              <input
                className={inputClass}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </label>
          </div>
        </section>

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
          disabled={saving || uploadingLogo || removingLogo}
          aria-busy={saving}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Organisation Details
        </button>
      </form>

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
