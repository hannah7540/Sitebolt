"use client";

import { useRef, useState, type DragEvent } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { formatAdminDate, uploadAdminItcPhoto } from "@/components/itc/admin/itp-itc-admin-api";
import {
  ADMIN_ITC_PHOTO_SLOTS,
  type AdminItcPhotoSlot,
  type AdminItcPhotoSlotId,
} from "@/components/itc/admin/itp-itc-admin-types";
import { formatFileSize, pathFromPublicUrl } from "@/components/itc/admin/itp-itc-admin-hybrid";
import ItcPhotoThumbGallery from "@/components/itc/ItcPhotoThumbGallery";
import { ITC_MAX_SECTION_PHOTOS } from "@/lib/itc-naming";
import { cn } from "@/lib/utils";

interface AdminItcPhotoSlotGridProps {
  projectId: string;
  itcId: string;
  slots: Record<string, AdminItcPhotoSlot>;
  onChange: (slots: Record<string, AdminItcPhotoSlot>) => void;
}

function slotUrls(slot: AdminItcPhotoSlot | undefined): string[] {
  if (!slot) return [];
  if (slot.urls?.length) return slot.urls;
  return slot.url ? [slot.url] : [];
}

export default function AdminItcPhotoSlotGrid({
  projectId,
  itcId,
  slots,
  onChange,
}: AdminItcPhotoSlotGridProps) {
  const fileRefs = useRef<Partial<Record<AdminItcPhotoSlotId, HTMLInputElement | null>>>({});
  const [busySlot, setBusySlot] = useState<AdminItcPhotoSlotId | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const patchSlot = (id: AdminItcPhotoSlotId, patch: Partial<AdminItcPhotoSlot>) => {
    onChange({
      ...slots,
      [id]: {
        ...(slots[id] ?? {
          id,
          url: null,
          urls: [],
          path: null,
          captured_at: null,
          file_size: null,
          not_required: false,
        }),
        ...patch,
        id,
      },
    });
  };

  const handleUpload = async (slotId: AdminItcPhotoSlotId, files: File[]) => {
    if (!files.length) return;
    const current = slots[slotId];
    const urls = [...slotUrls(current)];
    if (urls.length >= ITC_MAX_SECTION_PHOTOS) {
      setMessage(`Maximum of ${ITC_MAX_SECTION_PHOTOS} photos reached for this section.`);
      return;
    }
    setBusySlot(slotId);
    setMessage(null);
    const slot = ADMIN_ITC_PHOTO_SLOTS.find((row) => row.id === slotId);
    for (const file of files) {
      if (urls.length >= ITC_MAX_SECTION_PHOTOS) {
        setMessage(`Maximum of ${ITC_MAX_SECTION_PHOTOS} photos reached for this section.`);
        break;
      }
      const uploaded = await uploadAdminItcPhoto({
        projectId,
        itcId,
        file,
        label: slot?.label ?? slotId,
      });
      if (uploaded.error || !uploaded.photo) {
        setMessage(uploaded.error ?? "Photo upload failed");
        break;
      }
      urls.push(uploaded.photo.url);
      patchSlot(slotId, {
        url: urls[0] ?? null,
        urls,
        path: pathFromPublicUrl(uploaded.photo.url),
        captured_at: uploaded.photo.captured_at ?? new Date().toISOString(),
        file_size: file.size,
        not_required: false,
      });
    }
    setBusySlot(null);
  };

  const handleDrop = (slotId: AdminItcPhotoSlotId, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    void handleUpload(slotId, files);
  };

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-900">QA photo sections</h3>
      <p className="mb-3 text-xs text-slate-500">
        Up to {ITC_MAX_SECTION_PHOTOS} photos per construction stage. Drag and drop or select multiple
        images. Haunching can be marked N/A.
      </p>
      {message ? <p className="mb-3 text-sm text-rose-600">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_ITC_PHOTO_SLOTS.map((slot) => {
          const row = slots[slot.id];
          const busy = busySlot === slot.id;
          const isNa = Boolean(row?.not_required);
          const urls = isNa ? [] : slotUrls(row);
          const hasPhoto = urls.length > 0;
          return (
            <div
              key={slot.id}
              className={cn(
                "overflow-hidden rounded-xl border bg-white",
                isNa
                  ? "border-slate-300"
                  : hasPhoto
                    ? "border-emerald-400"
                    : "border-dashed border-amber-400"
              )}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(slot.id, event)}
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                {isNa ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    N/A
                  </span>
                ) : hasPhoto ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                    <Check className="h-3 w-3" /> {urls.length}/{ITC_MAX_SECTION_PHOTOS}
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    Missing
                  </span>
                )}
              </div>
              <div className="space-y-2 bg-slate-50 p-3">
                {hasPhoto ? <ItcPhotoThumbGallery urls={urls} disabled={busy} onRemove={(url) => {
                  const next = urls.filter((item) => item !== url);
                  patchSlot(slot.id, { url: next[0] ?? null, urls: next });
                }} /> : null}
                <button
                  type="button"
                  disabled={busy || isNa || urls.length >= ITC_MAX_SECTION_PHOTOS}
                  onClick={() => fileRefs.current[slot.id]?.click()}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white py-2 text-xs font-semibold text-slate-600 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : <Camera className="h-4 w-4 text-orange-500" />}
                  {isNa ? "Not required" : "Add photos"}
                </button>
              </div>
              <input
                ref={(node) => {
                  fileRefs.current[slot.id] = node;
                }}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void handleUpload(slot.id, files);
                }}
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-slate-500">
                <span>
                  {hasPhoto
                    ? [formatFileSize(row?.file_size), formatAdminDate(row?.captured_at)]
                        .filter(Boolean)
                        .join(" · ")
                    : "No file yet"}
                </span>
                {slot.allowNa ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      patchSlot(slot.id, {
                        not_required: !isNa,
                        url: isNa ? row?.url ?? null : null,
                        urls: isNa ? slotUrls(row) : [],
                      })
                    }
                    className="font-semibold text-slate-600 hover:text-orange-600"
                  >
                    {isNa ? "Undo N/A" : "N/A"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
