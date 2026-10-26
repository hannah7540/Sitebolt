"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { uploadAdminItcPhoto } from "@/components/itc/admin/itp-itc-admin-api";
import { ITC_MAX_SECTION_PHOTOS } from "@/lib/itc-naming";
import { cn } from "@/lib/utils";

interface AdminItcChecklistStepPhotosProps {
  projectId: string;
  itcId: string;
  stepKey: string;
  stepLabel: string;
  photos: string[];
  onChange: (photos: string[]) => void;
}

export default function AdminItcChecklistStepPhotos({
  projectId,
  itcId,
  stepKey,
  stepLabel,
  photos,
  onChange,
}: AdminItcChecklistStepPhotosProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = async (files: File[]) => {
    if (!files.length) return;
    if (photos.length >= ITC_MAX_SECTION_PHOTOS) {
      setMessage(`Maximum of ${ITC_MAX_SECTION_PHOTOS} photos for this step.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    const next = [...photos];
    for (const file of files) {
      if (next.length >= ITC_MAX_SECTION_PHOTOS) {
        setMessage(`Maximum of ${ITC_MAX_SECTION_PHOTOS} photos for this step.`);
        break;
      }
      const uploaded = await uploadAdminItcPhoto({
        projectId,
        itcId,
        file,
        label: `${stepLabel} (${stepKey})`,
      });
      if (uploaded.error || !uploaded.photo) {
        setMessage(uploaded.error ?? "Photo upload failed");
        break;
      }
      next.push(uploaded.photo.url);
    }
    onChange(next);
    setBusy(false);
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || photos.length >= ITC_MAX_SECTION_PHOTOS}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700",
            "hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
          ) : (
            <Camera className="h-3.5 w-3.5 text-orange-500" />
          )}
          Add photo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []).filter((file) =>
              file.type.startsWith("image/")
            );
            void handleUpload(files);
            event.target.value = "";
          }}
        />
        <span className="text-[11px] text-slate-500">
          {photos.length}/{ITC_MAX_SECTION_PHOTOS} attached to this step
        </span>
      </div>
      {message ? <p className="text-xs text-rose-600">{message}</p> : null}
      {photos.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            <div
              key={url}
              className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => onChange(photos.filter((item) => item !== url))}
                className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white"
                aria-label="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
