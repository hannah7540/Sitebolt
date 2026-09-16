"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { formatAdminDate, uploadAdminItcPhoto } from "@/components/itc/admin/itp-itc-admin-api";
import {
  ADMIN_ITC_PHOTO_SLOTS,
  type AdminItcPhotoSlot,
  type AdminItcPhotoSlotId,
} from "@/components/itc/admin/itp-itc-admin-types";
import { formatFileSize, pathFromPublicUrl } from "@/components/itc/admin/itp-itc-admin-hybrid";
import { cn } from "@/lib/utils";

interface AdminItcPhotoSlotGridProps {
  projectId: string;
  itcId: string;
  slots: Record<string, AdminItcPhotoSlot>;
  onChange: (slots: Record<string, AdminItcPhotoSlot>) => void;
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

  const handleUpload = async (slotId: AdminItcPhotoSlotId, file: File | undefined) => {
    if (!file) return;
    setBusySlot(slotId);
    setMessage(null);
    const slot = ADMIN_ITC_PHOTO_SLOTS.find((row) => row.id === slotId);
    const uploaded = await uploadAdminItcPhoto({
      projectId,
      itcId,
      file,
      label: slot?.label ?? slotId,
    });
    setBusySlot(null);
    if (uploaded.error || !uploaded.photo) {
      setMessage(uploaded.error ?? "Photo upload failed");
      return;
    }
    patchSlot(slotId, {
      url: uploaded.photo.url,
      path: pathFromPublicUrl(uploaded.photo.url),
      captured_at: uploaded.photo.captured_at ?? new Date().toISOString(),
      file_size: file.size,
      not_required: false,
    });
  };

  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-900">9-slot QA photo grid</h3>
      <p className="mb-3 text-xs text-slate-500">
        Capture each construction stage. Haunching can be marked N/A. Images store in{" "}
        <code>itc-photos</code>.
      </p>
      {message ? <p className="mb-3 text-sm text-rose-600">{message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_ITC_PHOTO_SLOTS.map((slot) => {
          const row = slots[slot.id];
          const busy = busySlot === slot.id;
          const isNa = Boolean(row?.not_required);
          const hasPhoto = Boolean(row?.url) && !isNa;
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
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">{slot.label}</p>
                {isNa ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    N/A
                  </span>
                ) : hasPhoto ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                    <Check className="h-3 w-3" /> Photo
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                    Missing
                  </span>
                )}
              </div>
              <button
                type="button"
                disabled={busy || isNa}
                onClick={() => fileRefs.current[slot.id]?.click()}
                className={cn(
                  "relative flex h-36 w-full items-center justify-center bg-slate-50",
                  (busy || isNa) && "opacity-70"
                )}
              >
                {hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.url ?? ""} alt={slot.label} className="h-full w-full object-cover" />
                ) : (
                  <span className="inline-flex flex-col items-center gap-1 text-xs text-slate-500">
                    {busy ? (
                      <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                    ) : (
                      <Camera className="h-5 w-5 text-orange-500" />
                    )}
                    {isNa ? "Not required" : "Upload / camera"}
                  </span>
                )}
              </button>
              <input
                ref={(node) => {
                  fileRefs.current[slot.id] = node;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void handleUpload(slot.id, file);
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
