"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Star } from "lucide-react";
import type { ItcStepPhoto } from "@/lib/itc-service";
import { addItcStepPhoto, setStepPhotoApproval } from "@/lib/itc-service";
import {
  ITC_FIELD_PHOTO_STEP_KEY,
  ITC_MAX_FIELD_PHOTOS,
  ITC_MAX_FINAL_PHOTOS,
} from "@/lib/itc-naming";
import { prepareItcPhotoUpload, uploadItcPhoto } from "@/lib/itc-upload";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcFieldPhotoGalleryProps {
  projectId: string;
  itcId: string;
  photos: ItcStepPhoto[];
  uploadedBy?: string;
  uploadedByName?: string;
  isAdmin?: boolean;
  adminId?: string;
  adminName?: string;
  onUpdated: () => void;
}

export default function ItcFieldPhotoGallery({
  projectId,
  itcId,
  photos,
  uploadedBy,
  uploadedByName,
  isAdmin = false,
  adminId,
  adminName,
  onUpdated,
}: ItcFieldPhotoGalleryProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fieldPhotos = photos.filter((photo) => photo.step_key === ITC_FIELD_PHOTO_STEP_KEY);
  const finalCount = fieldPhotos.filter((photo) => photo.is_approved_for_export).length;
  const canUpload = fieldPhotos.length < ITC_MAX_FIELD_PHOTOS;

  const handleUpload = async (file: File) => {
    if (!canUpload) {
      setMessage(`Maximum of ${ITC_MAX_FIELD_PHOTOS} field photos reached.`);
      return;
    }

    setLoading(true);
    setMessage(null);

    const prepared = await prepareItcPhotoUpload(file);
    const upload = await uploadItcPhoto({
      projectId,
      itcId,
      slotKey: ITC_FIELD_PHOTO_STEP_KEY,
      file: prepared.file,
    });

    if (upload.error || !upload.url) {
      setLoading(false);
      setMessage(upload.error ?? "Upload failed");
      return;
    }

    const save = await addItcStepPhoto({
      itcId,
      stepKey: ITC_FIELD_PHOTO_STEP_KEY,
      photoUrl: upload.url,
      gpsLat: prepared.gpsLat,
      gpsLng: prepared.gpsLng,
      uploadedBy,
      uploadedByName,
    });

    setLoading(false);
    if (save.error) {
      setMessage(save.error);
      return;
    }
    onUpdated();
  };

  const handleToggleFinal = async (photoId: string, approved: boolean) => {
    setLoading(true);
    setMessage(null);
    const result = await setStepPhotoApproval({
      photoId,
      approved,
      approvedBy: adminId,
      approvedByName: adminName,
    });
    setLoading(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    onUpdated();
  };

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">Field Inspection Photos</h3>
          <p className="text-xs text-slate-500">
            Workers can upload up to {ITC_MAX_FIELD_PHOTOS} photos. Admins select up to{" "}
            {ITC_MAX_FINAL_PHOTOS} final photos for the certified ITC report.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {fieldPhotos.length}/{ITC_MAX_FIELD_PHOTOS} uploaded
          </span>
          {isAdmin ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
              {finalCount}/{ITC_MAX_FINAL_PHOTOS} final
            </span>
          ) : null}
          <button
            type="button"
            disabled={loading || !canUpload}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Add Photo
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = "";
          }}
        />
      </div>

      {fieldPhotos.length === 0 ? (
        <p className="px-4 py-6 text-sm text-slate-500">
          No field photos uploaded yet. Capture up to {ITC_MAX_FIELD_PHOTOS} images before completing
          sign-off steps.
        </p>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {fieldPhotos.map((photo) => (
            <div
              key={photo.id}
              className={cn(
                "overflow-hidden rounded-lg border",
                photo.is_approved_for_export
                  ? "border-amber-400 ring-2 ring-amber-200"
                  : "border-slate-200"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.photo_url}
                alt="Field inspection evidence"
                className="aspect-video w-full object-cover"
              />
              <div className="space-y-1 px-3 py-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-900">
                  {photo.uploaded_by_name ?? photo.uploaded_by ?? "Worker"}
                </p>
                <p>
                  {photo.captured_at
                    ? new Date(photo.captured_at).toLocaleString()
                    : "No timestamp"}
                </p>
                {photo.gps_lat != null && photo.gps_lng != null ? (
                  <p>
                    GPS {photo.gps_lat.toFixed(5)}, {photo.gps_lng.toFixed(5)}
                  </p>
                ) : null}
                {isAdmin ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() =>
                      void handleToggleFinal(photo.id, !photo.is_approved_for_export)
                    }
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded px-2 py-1 font-semibold",
                      photo.is_approved_for_export
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        photo.is_approved_for_export && "fill-amber-500 text-amber-500"
                      )}
                    />
                    {photo.is_approved_for_export ? "Final Photo" : "Mark as Final"}
                  </button>
                ) : photo.is_approved_for_export ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                    Featured on certified report
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {message ? <p className="px-4 pb-4 text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}
