"use client";

import { useEffect, useState } from "react";
import { Camera, FileText, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface HiredLabourCertCaptureProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  existingUrl?: string | null;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split("?")[0]?.endsWith(".pdf") === true;
}

function fileLabel(file: File | null, existingUrl?: string | null): string {
  if (file?.name) return file.name;
  if (!existingUrl) return "";
  try {
    const path = new URL(existingUrl, "https://sitebolt.local").pathname;
    const name = decodeURIComponent(path.split("/").pop() ?? "");
    return name || "Saved document";
  } catch {
    return "Saved document";
  }
}

function isAllowedCertFile(file: File): boolean {
  if (isPdfFile(file) || file.type.startsWith("image/")) return true;
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) return true;
  return !file.type && file.size > 0;
}

export default function HiredLabourCertCapture({
  file,
  onFileChange,
  existingUrl,
}: HiredLabourCertCaptureProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const hasSelection = Boolean(file || existingUrl);
  const pdfSelected = file ? isPdfFile(file) : Boolean(existingUrl && isPdfUrl(existingUrl));
  const imagePreview = file && !isPdfFile(file) ? previewUrl : !file && existingUrl && !pdfSelected ? existingUrl : null;
  const name = fileLabel(file, existingUrl);

  useEffect(() => {
    if (!file || isPdfFile(file)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = (selected: File | null) => {
    if (!selected) return;
    if (!isAllowedCertFile(selected)) {
      setPickerError("Choose a photo or a PDF.");
      return;
    }
    setPickerError(null);
    onFileChange(selected);
  };

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">Document</span>
      {hasSelection ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
          {imagePreview ? (
            // Camera captures are local object URLs; next/image cannot render those.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview}
              alt="Certificate preview"
              className="mx-auto max-h-40 w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 py-3 text-slate-600">
              <FileText className="h-10 w-10 text-orange-500" />
              <p className="text-sm font-medium">PDF document</p>
            </div>
          )}
          {name ? <p className="mt-2 truncate text-xs font-medium text-slate-700">{name}</p> : null}
          {existingUrl && pdfSelected && !file ? (
            <a
              href={existingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-orange-600 hover:underline"
            >
              View saved file
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Take a photo of the card, or upload a photo or PDF.</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300",
            "bg-orange-50 px-3 py-3 text-sm font-semibold text-orange-600",
            "transition hover:border-orange-500 hover:bg-orange-100"
          )}
        >
          <Camera className="h-4 w-4 shrink-0" />
          <span>{hasSelection ? "Retake" : "Take Photo"}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              acceptFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        <label
          className={cn(
            "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300",
            "bg-white px-3 py-3 text-sm font-semibold text-slate-700",
            "transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600"
          )}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span>{hasSelection ? "Replace" : "Upload File / PDF"}</span>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(event) => {
              acceptFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {pickerError ? <p className="text-xs text-red-600">{pickerError}</p> : null}
    </div>
  );
}
