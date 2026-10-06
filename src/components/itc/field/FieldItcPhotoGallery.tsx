"use client";

import { useRef, useState, type DragEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import {
  FIELD_ITC_PHOTO_SLOTS,
  markPhotoSlotNotRequired,
  photosForSlot,
  removeFieldItcPhotoUrl,
  uploadFieldItcPhoto,
  type FieldItcPhoto,
  type FieldItcPhotoSlotKey,
  type FieldItcRecord,
} from "@/lib/api/itc";
import ItcPhotoThumbGallery from "@/components/itc/ItcPhotoThumbGallery";
import { ITC_MAX_SECTION_PHOTOS } from "@/lib/itc-naming";
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

  const handleUpload = async (slotKey: FieldItcPhotoSlotKey, files: File[]) => {
    if (!files.length) return;
    const existing = photosForSlot(photos, slotKey);
    if (existing.length >= ITC_MAX_SECTION_PHOTOS) {
      setMessage(`Maximum of ${ITC_MAX_SECTION_PHOTOS} photos reached for this section.`);
      return;
    }
    setBusySlot(slotKey);
    setMessage(null);
    for (const file of files) {
      const result = await uploadFieldItcPhoto({
        projectId,
        itcId: itc.id,
        slotKey,
        file,
        uploadedBy,
      });
      if (result.error) {
        setMessage(result.error);
        break;
      }
    }
    setBusySlot(null);
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

  const handleRemove = async (slotKey: FieldItcPhotoSlotKey, url: string) => {
    setBusySlot(slotKey);
    const result = await removeFieldItcPhotoUrl({ itcId: itc.id, slotKey, url });
    setBusySlot(null);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    onChanged();
  };

  const handleDrop = (slotKey: FieldItcPhotoSlotKey, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    void handleUpload(slotKey, files);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Photo QA gallery</h2>
        <p className="text-xs text-slate-500">
          Up to {ITC_MAX_SECTION_PHOTOS} photos per section. Drag and drop or select multiple images.
        </p>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_ITC_PHOTO_SLOTS.map((slot) => {
          const urls = photosForSlot(photos, slot.key);
          const busy = busySlot === slot.key;
          const photo = photos.find((row) => row.slot_key === slot.key);
          return (
            <div
              key={slot.key}
              className={`${cardClass} overflow-hidden`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(slot.key, event)}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                {photo?.not_required ? (
                  <span className="text-[11px] font-semibold uppercase text-slate-500">N/A</span>
                ) : urls.length ? (
                  <span className="text-[11px] font-semibold uppercase text-emerald-700">
                    {urls.length}/{ITC_MAX_SECTION_PHOTOS}
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold uppercase text-amber-700">Required</span>
                )}
              </div>
              <div className="space-y-2 bg-slate-50 p-3">
                {urls.length ? (
                  <ItcPhotoThumbGallery
                    urls={urls}
                    disabled={busy}
                    onRemove={(url) => void handleRemove(slot.key, url)}
                  />
                ) : (
                  <p className="text-center text-xs text-slate-500">No photos yet</p>
                )}
                <button
                  type="button"
                  disabled={busy || Boolean(photo?.not_required) || urls.length >= ITC_MAX_SECTION_PHOTOS}
                  onClick={() => fileRefs.current[slot.key]?.click()}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white py-2 text-xs font-semibold text-slate-600",
                    busy && "opacity-70"
                  )}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : <Camera className="h-4 w-4 text-orange-500" />}
                  Add photos
                </button>
              </div>
              <input
                ref={(node) => {
                  fileRefs.current[slot.key] = node;
                }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void handleUpload(slot.key, files);
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
