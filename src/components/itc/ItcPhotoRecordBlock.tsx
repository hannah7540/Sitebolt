"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import type { ItcPhoto } from "@/lib/itc-service";
import { saveItcPhoto } from "@/lib/itc-service";
import { ITC_PHOTO_SLOTS } from "@/lib/itc-templates";
import { uploadItcPhoto } from "@/lib/itc-upload";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcPhotoRecordBlockProps {
  projectId: string;
  itcId: string;
  photos: ItcPhoto[];
  uploadedBy?: string;
  onUpdated: () => void;
}

export default function ItcPhotoRecordBlock({
  projectId,
  itcId,
  photos,
  uploadedBy,
  onUpdated,
}: ItcPhotoRecordBlockProps) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [loadingSlot, setLoadingSlot] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = async (slotKey: string, file: File) => {
    setLoadingSlot(slotKey);
    setMessage(null);
    const upload = await uploadItcPhoto({ projectId, itcId, slotKey, file });
    if (upload.error || !upload.url) {
      setLoadingSlot(null);
      setMessage(upload.error ?? "Upload failed");
      return;
    }

    const save = await saveItcPhoto({
      itcId,
      slotKey,
      photoUrl: upload.url,
      notRequired: false,
      uploadedBy,
    });

    setLoadingSlot(null);
    if (save.error) {
      setMessage(save.error);
      return;
    }
    onUpdated();
  };

  const handleNotRequired = async (slotKey: string, reason: string) => {
    setLoadingSlot(slotKey);
    const save = await saveItcPhoto({
      itcId,
      slotKey,
      photoUrl: null,
      notRequired: true,
      notRequiredReason: reason,
      uploadedBy,
    });
    setLoadingSlot(null);
    if (save.error) {
      setMessage(save.error);
      return;
    }
    onUpdated();
  };

  return (
    <div className={cardClass}>
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900">Photo Record</h3>
        <p className="text-xs text-slate-500">
          On-device compression with auto GPS and timestamp tags.
        </p>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITC_PHOTO_SLOTS.map((slot) => {
          const photo = photos.find((row) => row.slot_key === slot.key);
          const isLoading = loadingSlot === slot.key;

          return (
            <div key={slot.key} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{slot.label}</p>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : null}
              </div>

              <div
                className={cn(
                  "mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50",
                  photo?.photo_url && "border-solid"
                )}
              >
                {photo?.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.photo_url} alt={slot.label} className="h-full w-full object-cover" />
                ) : photo?.not_required ? (
                  <span className="px-2 text-center text-xs text-slate-500">
                    N/A — {photo.not_required_reason ?? "Not required"}
                  </span>
                ) : (
                  <Camera className="h-6 w-6 text-slate-400" />
                )}
              </div>

              {photo?.captured_at ? (
                <p className="mb-2 text-[10px] text-slate-500">
                  {new Date(photo.captured_at).toLocaleString()}
                  {photo.gps_lat != null && photo.gps_lng != null
                    ? ` · GPS ${photo.gps_lat.toFixed(5)}, ${photo.gps_lng.toFixed(5)}`
                    : ""}
                </p>
              ) : null}

              <input
                ref={(node) => {
                  fileRefs.current[slot.key] = node;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUpload(slot.key, file);
                  event.target.value = "";
                }}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileRefs.current[slot.key]?.click()}
                  className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  Capture
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt("Reason this photo is not required:");
                    if (reason?.trim()) void handleNotRequired(slot.key, reason.trim());
                  }}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Not Required
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {message ? <p className="px-4 pb-4 text-sm text-red-600">{message}</p> : null}
    </div>
  );
}
