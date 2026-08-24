"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Camera, FolderOpen, FileText, X, Loader2, ZoomIn } from "lucide-react";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";

export interface DocumentCaptureProps {
  label?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Previously saved document URL (storage or remote) */
  existingUrl?: string | null;
  /** Optional second image (e.g. card back) for lightbox gallery */
  existingUrlBack?: string | null;
  /** URL after immediate upload completes */
  uploadedUrl?: string | null;
  uploadedUrlBack?: string | null;
  onUploaded?: (url: string | null) => void;
  onUploadedBack?: (url: string | null) => void;
  /** When set, uploads to worker-docs immediately on selection */
  uploadPath?: string;
  uploadPathBack?: string;
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

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return false;
  return (
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".png") ||
    lower.includes(".webp") ||
    lower.includes(".gif") ||
    lower.includes(".heic") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:image") ||
    !lower.includes(".")
  );
}

export default function DocumentCapture({
  label,
  file,
  onFileChange,
  existingUrl,
  existingUrlBack,
  uploadedUrl,
  uploadedUrlBack,
  onUploaded,
  onUploadedBack,
  uploadPath,
  uploadPathBack,
  disabled = false,
  className,
}: DocumentCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraBackInputRef = useRef<HTMLInputElement>(null);
  const fileBackInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const displayUrl = previewUrl ?? uploadedUrl ?? existingUrl ?? null;
  const displayUrlBack = uploadedUrlBack ?? existingUrlBack ?? null;
  const supportBack = Boolean(onUploadedBack || existingUrlBack || uploadedUrlBack);

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

  const handleBackFile = useCallback(
    async (selected: File | null) => {
      if (!selected || !onUploadedBack) return;
      setUploadError(null);
      if (uploadPathBack) {
        setUploadingBack(true);
        const url = await uploadWorkerDocumentSafe(selected, uploadPathBack);
        setUploadingBack(false);
        if (!url) {
          setUploadError("Back image upload failed. Please try again.");
          onUploadedBack(null);
        } else {
          onUploadedBack(url);
        }
      }
    },
    [onUploadedBack, uploadPathBack]
  );

  const clear = () => {
    onFileChange(null);
    onUploaded?.(null);
    setUploadError(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearBack = () => {
    onUploadedBack?.(null);
    if (cameraBackInputRef.current) cameraBackInputRef.current.value = "";
    if (fileBackInputRef.current) fileBackInputRef.current.value = "";
  };

  const showPdfPreview = file && isPdf(file);
  const showImagePreview =
    displayUrl && !showPdfPreview && isImageUrl(displayUrl);
  const showBackImage = Boolean(displayUrlBack && isImageUrl(displayUrlBack));

  const lightboxImages = [
    ...(showImagePreview && displayUrl
      ? [{ url: displayUrl, alt: label ? `${label} (front)` : "Document front" }]
      : []),
    ...(showBackImage && displayUrlBack
      ? [{ url: displayUrlBack, alt: label ? `${label} (back)` : "Document back" }]
      : []),
  ];

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <span className={cn("block text-sm font-medium text-slate-700", labelClass)}>
          {label}
        </span>
      )}

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
      {supportBack ? (
        <>
          <input
            ref={cameraBackInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={disabled || uploadingBack}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) void handleBackFile(f);
              e.target.value = "";
            }}
          />
          <input
            ref={fileBackInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled || uploadingBack}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              if (f) void handleBackFile(f);
              e.target.value = "";
            }}
          />
        </>
      ) : null}

      {(showImagePreview || showPdfPreview || (displayUrl && !showImagePreview) || showBackImage) && (
        <div className="space-y-2">
          <div className={cn("grid gap-2", showBackImage || supportBack ? "sm:grid-cols-2" : "")}>
            {(showImagePreview || showPdfPreview || (displayUrl && !showImagePreview)) && (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                {uploading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                  </div>
                )}
                {showImagePreview && displayUrl ? (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(0)}
                    className="group relative block w-full"
                    aria-label="Open full image preview"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayUrl}
                      alt="Document preview"
                      className="mx-auto max-h-40 w-full rounded-lg object-contain"
                    />
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition group-hover:bg-black/30">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 transition group-hover:opacity-100" />
                    </span>
                    {supportBack ? (
                      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                        Front
                      </span>
                    ) : null}
                  </button>
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

            {(showBackImage || supportBack) && (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
                {uploadingBack && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                  </div>
                )}
                {showBackImage && displayUrlBack ? (
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(showImagePreview ? 1 : 0)}
                    className="group relative block w-full"
                    aria-label="Open back image preview"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={displayUrlBack}
                      alt="Document back preview"
                      className="mx-auto max-h-40 w-full rounded-lg object-contain"
                    />
                    <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/0 transition group-hover:bg-black/30">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 transition group-hover:opacity-100" />
                    </span>
                    <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Back
                    </span>
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-slate-500">
                    <p className="text-xs font-medium">No back image</p>
                    {!disabled && onUploadedBack ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => cameraBackInputRef.current?.click()}
                          className="text-xs font-semibold text-orange-600 hover:underline"
                        >
                          Take photo
                        </button>
                        <button
                          type="button"
                          onClick={() => fileBackInputRef.current?.click()}
                          className="text-xs font-semibold text-orange-600 hover:underline"
                        >
                          Upload
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
                {!disabled && showBackImage ? (
                  <button
                    type="button"
                    onClick={clearBack}
                    className="absolute right-2 top-2 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 text-slate-500 hover:text-red-600"
                    aria-label="Remove back image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            )}
          </div>
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
          <span>{supportBack ? "Front Photo" : "Take Photo"}</span>
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
          <span>{supportBack ? "Front File" : "Upload File"}</span>
        </button>
      </div>

      {supportBack && onUploadedBack ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled || uploadingBack}
            onClick={() => cameraBackInputRef.current?.click()}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-200",
              "bg-orange-50/60 px-3 py-2.5 text-xs font-semibold text-orange-700",
              "transition hover:border-orange-400 hover:bg-orange-100",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" />
            Back Photo
          </button>
          <button
            type="button"
            disabled={disabled || uploadingBack}
            onClick={() => fileBackInputRef.current?.click()}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200",
              "bg-white px-3 py-2.5 text-xs font-semibold text-slate-600",
              "transition hover:border-orange-300 hover:bg-orange-50",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            Back File
          </button>
        </div>
      ) : null}

      {file && !showImagePreview && !showPdfPreview && (
        <p className="truncate text-xs text-emerald-600">{file.name}</p>
      )}
      {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
      {uploadedUrl && !uploading && (
        <p className="text-xs text-emerald-600">Uploaded to worker-docs</p>
      )}

      {lightboxIndex !== null && lightboxImages.length > 0 ? (
        <ImageLightboxGallery
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
