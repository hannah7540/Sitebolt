"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import {
  FIELD_ITC_PHOTO_SLOTS,
  markPhotoSlotNotRequired,
  photoForSlot,
  uploadFieldItcPhoto,
  type FieldItcPhoto,
  type FieldItcPhotoSlotKey,
  type FieldItcRecord,
} from "@/lib/api/itc";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FieldItcPhotoGalleryProps {
  projectId: string;
  itc: FieldItcRecord;
  photos: FieldItcPhoto[];
  uploadedBy: string | null;
  onChanged: () => void;
}

export default function FieldItcPhotoGallery({
  projectId,
  itc,
  photos,
  uploadedBy,
  onChanged,
}: FieldItcPhotoGalleryProps) {
  const fileRefs = useRef<Partial<Record<FieldItcPhotoSlotKey, HTMLInputElement | null>>>({});
  const [busySlot, setBusySlot] = useState<FieldItcPhotoSlotKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = async (slotKey: FieldItcPhotoSlotKey, file: File | undefined) => {
    if (!file) return;
    setBusySlot(slotKey);
    setMessage(null);
    const result = await uploadFieldItcPhoto({
      projectId,
      itcId: itc.id,
      slotKey,
      file,
      uploadedBy,
    });
    setBusySlot(null);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    onChanged();
  };

  const handleNa = async (slotKey: FieldItcPhotoSlotKey) => {
    setBusySlot(slotKey);
    const result = await markPhotoSlotNotRequired({
      itcId: itc.id,
      slotKey,
      uploadedBy,
    });
    setBusySlot(null);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    onChanged();
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Photo QA gallery</h2>
        <p className="text-xs text-slate-500">
          Nine ITC-level slots. Images are downscaled to 1600px / 0.72 JPEG and stored in{" "}
          <code>itc-photos</code>.
        </p>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_ITC_PHOTO_SLOTS.map((slot) => {
          const photo = photoForSlot(photos, slot.key);
          const busy = busySlot === slot.key;
          return (
            <div key={slot.key} className={`${cardClass} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                {photo?.not_required ? (
                  <span className="text-[11px] font-semibold uppercase text-slate-500">N/A</span>
                ) : photo?.photo_url ? (
                  <span className="text-[11px] font-semibold uppercase text-emerald-700">
                    Captured
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold uppercase text-amber-700">
                    Required
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRefs.current[slot.key]?.click()}
                className={cn(
                  "relative flex h-40 w-full items-center justify-center bg-slate-50",
                  busy && "opacity-70"
                )}
              >
                {photo?.photo_url && !photo.not_required ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.photo_url}
                    alt={slot.label}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="inline-flex flex-col items-center gap-1 text-xs text-slate-500">
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                    ) : (
                      <Camera className="h-5 w-5 text-orange-500" />
                    )}
                    Upload {slot.label}
                  </span>
                )}
              </button>
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
                  event.target.value = "";
                  void handleUpload(slot.key, file);
                }}
              />
              <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
                <span>
                  {photo?.gps_lat != null && photo?.gps_lng != null
                    ? `${photo.gps_lat.toFixed(4)}, ${photo.gps_lng.toFixed(4)}`
                    : "GPS on capture"}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleNa(slot.key)}
                  className="font-semibold text-slate-600 hover:text-orange-600"
                >
                  Mark N/A
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
