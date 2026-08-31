"use client";

import { Download, ExternalLink, Loader2 } from "lucide-react";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface AssetCertificateFieldProps {
  id: string;
  label: string;
  currentUrl: string | null | undefined;
  uploading?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
}

export default function AssetCertificateField({
  id,
  label,
  currentUrl,
  uploading = false,
  disabled = false,
  onFile,
}: AssetCertificateFieldProps) {
  return (
    <div className="space-y-2">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/jpg,image/webp"
        className={inputClass}
        disabled={disabled || uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
      {uploading ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Uploading certificate…
        </p>
      ) : null}
      {currentUrl ? (
        <div className="flex flex-wrap gap-3">
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View Current Certificate
          </a>
          <a
            href={currentUrl}
            download
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
        </div>
      ) : (
        <p className="text-xs text-slate-500">No certificate attached yet.</p>
      )}
    </div>
  );
}
