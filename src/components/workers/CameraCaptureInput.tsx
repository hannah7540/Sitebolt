"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";
import { isNativeMobileApp } from "@/lib/native-app";

interface CameraCaptureInputProps {
  label?: string;
  onCapture: (file: File | null) => void;
  className?: string;
}

async function photoUriToFile(uri: string, fileName: string): Promise<File> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const type = blob.type || "image/jpeg";
  return new File([blob], fileName, { type });
}

export default function CameraCaptureInput({
  label = "Take a photo",
  onCapture,
  className,
}: CameraCaptureInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

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

  const openNativeCamera = async (): Promise<boolean> => {
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import(
        "@capacitor/camera"
      );
      const photo = await CapCamera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
      });
      const uri = photo.webPath || photo.path;
      if (!uri) return false;
      const file = await photoUriToFile(
        uri,
        `incident-medical-${Date.now()}.${photo.format || "jpg"}`
      );
      applyFile(file);
      return true;
    } catch {
      return false;
    }
  };

  const handleTakePhoto = async () => {
    setError(null);
    if (isNativeMobileApp()) {
      setCapturing(true);
      try {
        const captured = await openNativeCamera();
        if (captured) return;
        // Fallback to standard file/camera input if Capacitor camera fails.
        inputRef.current?.click();
      } finally {
        setCapturing(false);
      }
      return;
    }
    inputRef.current?.click();
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
        Opens your device camera — gallery uploads are not permitted via this control.
        Use the file picker above for PDFs or existing images.
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
          onClick={() => void handleTakePhoto()}
          disabled={capturing}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          <Camera className="h-4 w-4" />
          {capturing ? "Opening camera…" : "Take Photo"}
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
