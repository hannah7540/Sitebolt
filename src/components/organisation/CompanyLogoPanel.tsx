"use client";

import { useRef, useState } from "react";
import { Building2, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { updateCompanyLogoUrl } from "@/lib/supabase";
import {
  isAllowedCompanyLogoFile,
  uploadCompanyLogo,
} from "@/lib/company-asset-upload";
import { useCompanyBranding } from "@/components/branding/CompanyBrandingProvider";
import { cardClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export default function CompanyLogoPanel() {
  const { logoUrl, companyName, loading, refreshBranding } = useCompanyBranding();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!isAllowedCompanyLogoFile(file)) {
      setError("Please upload a PNG, JPG, or SVG image.");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);

    try {
      const path = `logos/company-logo-${Date.now()}`;
      const { url, error: uploadError } = await uploadCompanyLogo(file, path);
      if (uploadError || !url) {
        setError(uploadError ?? "Logo upload failed.");
        return;
      }

      const { error: saveError } = await updateCompanyLogoUrl(url);
      if (saveError) {
        setError(saveError);
        return;
      }

      await refreshBranding();
      setMessage("Company logo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logo upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    setError(null);
    setMessage(null);

    try {
      const { error: saveError } = await updateCompanyLogoUrl(null);
      if (saveError) {
        setError(saveError);
        return;
      }

      await refreshBranding();
      setMessage("Company logo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className={`mt-6 max-w-xl space-y-4 p-6 ${cardClass}`}>
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Company Logo</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload your organisation logo for headers, safety forms, and printed site packs.
          Accepted formats: PNG, JPG, SVG.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-28 w-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          ) : logoUrl ? (
            <img
              src={logoUrl}
              alt={`${companyName} logo preview`}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-slate-400">
              <Building2 className="h-8 w-8" />
              <span className="text-xs">No logo uploaded</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            disabled={uploading || removing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Upload Logo
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={uploading || removing}
              onClick={handleRemove}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              )}
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove Logo
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <p className={labelClass}>
        Stored in Supabase bucket: <span className="font-medium">company-assets</span>
      </p>
    </div>
  );
}
