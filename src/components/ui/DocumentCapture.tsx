"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, FolderOpen, FileText, X, Loader2 } from "lucide-react";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";

export interface DocumentCaptureProps {
  label?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Previously saved document URL (storage or remote) */
  existingUrl?: string | null;
  /** URL after immediate upload completes */
  uploadedUrl?: string | null;
  onUploaded?: (url: string | null) => void;
  /** When set, uploads to worker-docs immediately on selection */
  uploadPath?: string;
  disabled?: boolean;
  className?: string;
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || !isPdf(file);
}

export default function DocumentCapture({
  label,
  file,
  onFileChange,
  existingUrl,
  uploadedUrl,
  onUploaded,
  uploadPath,
  disabled = false,
  className,
}: DocumentCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const displayUrl = previewUrl ?? uploadedUrl ?? existingUrl ?? null;

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    if (isImageFile(file) && !isPdf(file)) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [file]);

  const handleFile = useCallback(
    async (selected: File | null) => {
      if (!selected) return;
      setUploadError(null);
      onFileChange(selected);

      if (uploadPath && onUploaded) {
        setUploading(true);
        const url = await uploadWorkerDocumentSafe(selected, uploadPath);
        setUploading(false);
        if (!url) {
          setUploadError("Upload failed. Please try again.");
          onUploaded(null);
        } else {
          onUploaded(url);
        }
      }
    },
    [uploadPath, onUploaded, onFileChange]
  );

  const clear = () => {
    onFileChange(null);
    onUploaded?.(null);
    setUploadError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const showPdfPreview = file && isPdf(file);
  const showImagePreview =
    displayUrl && !showPdfPreview && !displayUrl.toLowerCase().includes(".pdf");

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <span className={cn("block text-sm font-medium text-slate-700", labelClass)}>
          {label}
        </span>
      )}

      {/* Hidden inputs — mobile OS shows Camera vs Photo Library */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        disabled={disabled || uploading}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {(showImagePreview || showPdfPreview || (displayUrl && !showImagePreview)) && (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          {uploading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          )}
          {showImagePreview && displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayUrl}
              alt="Document preview"
              className="mx-auto max-h-40 w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-4 text-slate-600">
              <FileText className="h-12 w-12 text-orange-500" />
              <p className="max-w-full truncate text-sm font-medium">
                {file?.name ?? "PDF document"}
              </p>
              {displayUrl && (
                <a
                  href={displayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-orange-600 hover:underline"
                >
                  View file
                </a>
              )}
            </div>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="absolute right-2 top-2 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 text-slate-500 hover:text-red-600"
              aria-label="Remove document"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => cameraInputRef.current?.click()}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300",
            "bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-600",
            "transition hover:border-orange-500 hover:bg-orange-100",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <Camera className="h-4 w-4 shrink-0" />
          <span>Take Photo</span>
        </button>
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300",
            "bg-white px-3 py-3 text-sm font-semibold text-slate-700",
            "transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span>Upload File</span>
        </button>
      </div>

      {file && !showImagePreview && !showPdfPreview && (
        <p className="truncate text-xs text-emerald-600">{file.name}</p>
      )}
      {uploadError && (
        <p className="text-xs text-red-600">{uploadError}</p>
      )}
      {uploadedUrl && !uploading && (
        <p className="text-xs text-emerald-600">Uploaded to worker-docs</p>
      )}
    </div>
  );
}
