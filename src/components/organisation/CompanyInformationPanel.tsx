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
    setAbn: (value: string) => void;
    setEmail: (value: string) => void;
    setPhone: (value: string) => void;
    setAddress: (value: string) => void;
    setLogoUrl: (value: string | null) => void;
  }
) {
  setters.setProfileId(record.id);
  setters.setCompanyName(record.company_name);
  setters.setAbn(record.abn);
  setters.setEmail(record.email);
  setters.setPhone(record.phone);
  setters.setAddress(record.address ?? "");
  setters.setLogoUrl(record.logo_url);
}

export default function CompanyInformationPanel() {
  const { refreshBranding } = useCompanyBranding();
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoPreviewBlobRef = useRef<string | null>(null);

  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [abn, setAbn] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoBroken, setLogoBroken] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formSetters = {
    setProfileId,
    setCompanyName,
    setAbn,
    setEmail,
    setPhone,
    setAddress,
    setLogoUrl,
  };

  const buildPayload = useCallback(
    (overrides?: Partial<OrganisationFormRecord>) => ({
      company_name: overrides?.company_name ?? companyName,
      abn: overrides?.abn ?? abn,
      email: overrides?.email ?? email,
      phone: overrides?.phone ?? phone,
      address: overrides?.address ?? address ?? "",
      logo_url: overrides?.logo_url !== undefined ? overrides.logo_url : logoUrl,
    }),
    [companyName, abn, email, phone, address, logoUrl]
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
        setLogoBroken(false);
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

  useEffect(() => {
    return () => {
      if (logoPreviewBlobRef.current) {
        URL.revokeObjectURL(logoPreviewBlobRef.current);
      }
    };
  }, []);

  const clearLocalLogoPreview = () => {
    if (logoPreviewBlobRef.current) {
      URL.revokeObjectURL(logoPreviewBlobRef.current);
      logoPreviewBlobRef.current = null;
    }
    setLogoPreviewUrl(null);
  };

  const setLocalLogoPreview = (file: File) => {
    clearLocalLogoPreview();
    const blobUrl = URL.createObjectURL(file);
    logoPreviewBlobRef.current = blobUrl;
    setLogoPreviewUrl(blobUrl);
    setLogoBroken(false);
  };

  const persistOrganisation = async (payload: ReturnType<typeof buildPayload>) => {
    const { organisation, error: saveError } = await saveOrganisationToApi(payload);
    if (saveError) {
      throw new Error(saveError);
    }
    if (!organisation) {
      throw new Error("Failed to save organisation details");
    }
    applyOrganisationRecord(organisation, formSetters);
    setLogoBroken(false);
    await refreshBranding();
    return organisation;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await persistOrganisation(buildPayload());
      showSuccess("Company information updated");
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to save organisation details";
      console.error("Company information save failed:", cause);
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

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
      const { url, error: uploadError } = await uploadOrganisationLogo(file);
      if (uploadError || !url) {
        throw new Error(uploadError ?? "Logo upload failed.");
      }

      setLogoUrl(url);
      await persistOrganisation(buildPayload({ logo_url: url }));
      clearLocalLogoPreview();
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
      setLogoBroken(false);
      await persistOrganisation(buildPayload({ logo_url: null }));
      showSuccess("Company logo removed");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to remove logo.";
      setError(message);
      showError(message);
    } finally {
      setRemovingLogo(false);
    }
  };

  const displayLogoSrc = logoPreviewUrl ?? logoUrl;
  const formDisabled = loading || uploadingLogo || removingLogo;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">
        Company <span className="text-orange-500">Information</span>
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Manage your organisation logo and core company details.
      </p>

      <form onSubmit={handleSave} className={`max-w-xl space-y-6 p-6 ${cardClass}`}>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading company profile…
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Company Logo</h2>
            <p className="mt-1 text-xs text-slate-500">
              Displayed in the site header, forms, and printable documents.
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            {displayLogoSrc && !logoBroken ? (
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-50 p-2">
                <img
                  src={displayLogoSrc}
                  alt="Company Logo"
                  className="max-h-24 max-w-full object-contain"
                  onError={() => {
                    console.error("Failed to load logo image:", displayLogoSrc);
                    setLogoBroken(true);
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
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                disabled={formDisabled || saving}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadingLogo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {logoUrl || logoPreviewUrl ? "Change Logo" : "Upload Logo"}
              </button>
              {logoUrl || logoPreviewUrl ? (
                <button
                  type="button"
                  disabled={formDisabled || saving}
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
        </div>

        <div className="space-y-4 border-t border-slate-200 pt-6">
          <label className="block space-y-1">
            <span className={labelClass}>Company name</span>
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={formDisabled}
              required
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>ABN</span>
            <input
              className={inputClass}
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              disabled={formDisabled}
              placeholder="12 345 678 901"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Email address</span>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={formDisabled}
              autoComplete="email"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Phone number</span>
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={formDisabled}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Company Address</span>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={formDisabled}
              placeholder="e.g. 123 Construction Way, Sydney NSW 2000"
              autoComplete="street-address"
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
          disabled={loading || saving || uploadingLogo || removingLogo}
          aria-busy={saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Changes
        </button>
      </form>

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
