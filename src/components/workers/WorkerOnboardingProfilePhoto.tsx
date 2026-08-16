"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, FolderOpen, Loader2, RotateCcw, User } from "lucide-react";
import { uploadImageAndGetUrl } from "@/lib/worker-image-upload";
import { updateWorkerPhotoUrl } from "@/lib/supabase";
import {
  PROFILE_PHOTO_REQUIRED_MESSAGE,
  validateProfilePhotoFile,
} from "@/lib/worker-profile-photo-validation";
import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";

const WorkerCamera = dynamic(
  () => import("react-camera-pro").then((mod) => mod.Camera),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center rounded-xl bg-slate-900 text-sm text-slate-300">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-orange-400" />
        Starting camera…
      </div>
    ),
  }
);

interface WorkerCameraHandle {
  takePhoto: (type?: "base64url" | "imgData") => string | ImageData;
  switchCamera: () => "user" | "environment";
  getNumberOfCameras: () => number;
}

interface WorkerOnboardingProfilePhotoProps {
  workerId: string;
  photoUrl: string | null;
  onPhotoUrlChange: (photoUrl: string) => void;
  disabled?: boolean;
  showValidationError?: boolean;
}

export default function WorkerOnboardingProfilePhoto({
  workerId,
  photoUrl,
  onPhotoUrlChange,
  disabled = false,
  showValidationError = false,
}: WorkerOnboardingProfilePhotoProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<WorkerCameraHandle | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [numberOfCameras, setNumberOfCameras] = useState(0);

  const persistPhoto = async (source: File | string, isBase64: boolean) => {
    setUploading(true);
    setError(null);

    const uploadPath = `profiles/${workerId}/${Date.now()}`;
    const { url, error: uploadError } = await uploadImageAndGetUrl(
      source,
      uploadPath,
      { isBase64 }
    );

    if (uploadError || !url) {
      setUploading(false);
      setError(uploadError ?? "Upload failed. Please try again.");
      return;
    }

    const { error: updateError } = await updateWorkerPhotoUrl(workerId, url);
    setUploading(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    onPhotoUrlChange(url);
    setShowCamera(false);
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    const validationError = validateProfilePhotoFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    await persistPhoto(file, false);
  };

  const handleCapture = async () => {
    const photo = cameraRef.current?.takePhoto();
    if (!photo || typeof photo !== "string") {
      setError("Could not capture photo. Please try again.");
      return;
    }
    await persistPhoto(photo, true);
  };

  const missingPhoto = showValidationError && !photoUrl?.trim();

  return (
    <div className="sm:col-span-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
        <p className={labelClass}>
          Profile Photo (Required) <span className="text-red-600">*</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Upload a clear headshot. JPG, PNG, or WebP up to 5 MB. Use your camera on
          mobile or choose a file on desktop.
        </p>

        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div
            className={cn(
              "flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-white",
              photoUrl ? "border-orange-200" : "border-dashed border-slate-300"
            )}
          >
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="Your profile photo"
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-10 w-10 text-slate-300" />
            )}
          </div>

          <div className="flex w-full flex-1 flex-col gap-2">
            {!showCamera ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:border-orange-400 hover:bg-orange-50 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                  ) : (
                    <FolderOpen className="h-4 w-4" />
                  )}
                  Upload Photo
                </button>
                <button
                  type="button"
                  disabled={disabled || uploading}
                  onClick={() => {
                    setError(null);
                    setShowCamera(true);
                  }}
                  className="flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                >
                  <Camera className="h-4 w-4" />
                  Take Photo
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setShowCamera(false)}
                  className="text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  ← Back to upload options
                </button>
                <div className="overflow-hidden rounded-xl bg-black">
                  <WorkerCamera
                    ref={cameraRef}
                    facingMode="user"
                    aspectRatio={1}
                    numberOfCamerasCallback={setNumberOfCameras}
                    errorMessages={{
                      noCameraAccessible: "No camera found on this device.",
                      permissionDenied: "Camera permission was denied.",
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void handleCapture()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    Capture Photo
                  </button>
                  {numberOfCameras > 1 ? (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => cameraRef.current?.switchCamera()}
                      className="rounded-lg border border-slate-300 px-3 py-2.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      aria-label="Switch camera"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              disabled={disabled || uploading}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = "";
                void handleFileSelected(file);
              }}
            />
          </div>
        </div>

        {missingPhoto ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {PROFILE_PHOTO_REQUIRED_MESSAGE}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
