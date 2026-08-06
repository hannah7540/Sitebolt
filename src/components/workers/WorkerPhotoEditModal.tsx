"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Camera, FolderOpen, Loader2, RotateCcw, X } from "lucide-react";
import { uploadImageAndGetUrl } from "@/lib/worker-image-upload";
import { updateWorkerPhotoUrl } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const WorkerCamera = dynamic(
  () => import("react-camera-pro").then((mod) => mod.Camera),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-xl bg-slate-900 text-sm text-slate-300">
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

type ModalMode = "choose" | "upload" | "camera";

interface WorkerPhotoEditModalProps {
  workerId: string;
  currentPhotoUrl?: string | null;
  onClose: () => void;
  onPhotoUpdated: (photoUrl: string) => void;
}

export default function WorkerPhotoEditModal({
  workerId,
  currentPhotoUrl,
  onClose,
  onPhotoUpdated,
}: WorkerPhotoEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<WorkerCameraHandle | null>(null);
  const [mode, setMode] = useState<ModalMode>("choose");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numberOfCameras, setNumberOfCameras] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    currentPhotoUrl ?? null
  );

  const uploadPath = `profiles/${workerId}/${Date.now()}`;

  const persistPhoto = async (source: File | string, isBase64: boolean) => {
    setUploading(true);
    setError(null);

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

    setPreviewUrl(url);
    onPhotoUpdated(url);
    onClose();
  };

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="worker-photo-modal-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2
              id="worker-photo-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              Profile Photo
            </h2>
            <p className="text-xs text-slate-500">
              Upload a new image or take a photo with your camera.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {previewUrl && mode === "choose" && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Current profile"
                className="h-24 w-24 rounded-full border-2 border-orange-200 object-cover"
              />
            </div>
          )}

          {mode === "choose" && (
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300",
                  "bg-white px-4 py-4 text-sm font-semibold text-slate-700",
                  "transition hover:border-orange-400 hover:bg-orange-50 hover:text-orange-600",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                ) : (
                  <FolderOpen className="h-5 w-5" />
                )}
                Upload New Image
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setError(null);
                  setMode("camera");
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300",
                  "bg-orange-50 px-4 py-4 text-sm font-semibold text-orange-600",
                  "transition hover:border-orange-500 hover:bg-orange-100",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <Camera className="h-5 w-5" />
                Take Photo
              </button>
            </div>
          )}

          {mode === "camera" && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setError(null);
                  setMode("choose");
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                ← Back to options
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
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  Capture Photo
                </button>
                {numberOfCameras > 1 && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => cameraRef.current?.switchCamera()}
                    className="rounded-xl border border-slate-300 px-4 py-3 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    aria-label="Switch camera"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              event.target.value = "";
              void handleFileSelected(file);
            }}
          />

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
