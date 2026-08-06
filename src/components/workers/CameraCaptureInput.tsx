"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";

interface CameraCaptureInputProps {
  label?: string;
  onCapture: (file: File | null) => void;
  className?: string;
}

export default function CameraCaptureInput({
  label = "Take a photo",
  onCapture,
  className,
}: CameraCaptureInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only camera photos are accepted.");
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    onCapture(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
    e.target.value = "";
  };

  const clearPhoto = () => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onCapture(null);
    setError(null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className={labelClass}>{label}</p>
      <p className="text-xs text-slate-500">
        Opens your device camera — gallery uploads are not permitted.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Camera className="h-4 w-4" />
          Take Photo
        </button>
        {preview && (
          <button
            type="button"
            onClick={clearPhoto}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Remove
          </button>
        )}
      </div>

      {preview && (
        <div className="overflow-hidden rounded-xl border border-orange-200 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Captured site" className="max-h-48 w-full rounded-lg object-contain" />
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
