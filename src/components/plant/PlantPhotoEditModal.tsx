"use client";

import { useRef, useState } from "react";
import { FolderOpen, Loader2, X } from "lucide-react";
import { uploadImageAndGetUrl } from "@/lib/worker-image-upload";
import { PLANT_IMAGES_BUCKET } from "@/lib/plant-doc-upload";
import { updatePlantPhotoUrl } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface PlantPhotoEditModalProps {
  plantId: string;
  currentPhotoUrl?: string | null;
  onClose: () => void;
  onPhotoUpdated: (photoUrl: string) => void;
}

export default function PlantPhotoEditModal({
  plantId,
  currentPhotoUrl,
  onClose,
  onPhotoUpdated,
}: PlantPhotoEditModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl ?? null);

  const handleFileSelected = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    setUploading(true);
    setError(null);

    const { url, error: uploadError } = await uploadImageAndGetUrl(
      file,
      `plant/${plantId}/${Date.now()}`,
      { bucket: PLANT_IMAGES_BUCKET }
    );

    if (uploadError || !url) {
      setUploading(false);
      setError(uploadError ?? "Upload failed.");
      return;
    }

    const { error: updateError } = await updatePlantPhotoUrl(plantId, url);
    setUploading(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    setPreviewUrl(url);
    onPhotoUpdated(url);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Plant Photo</h2>
            <p className="text-xs text-slate-500">Upload a machinery thumbnail image.</p>
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
          {previewUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Plant"
                className="h-28 w-40 rounded-lg border-2 border-orange-200 object-cover"
              />
            </div>
          )}

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300",
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
            Upload Image
          </button>

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
