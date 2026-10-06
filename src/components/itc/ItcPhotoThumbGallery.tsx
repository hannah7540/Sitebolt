"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ItcPhotoThumbGalleryProps {
  urls: string[];
  onRemove?: (url: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function ItcPhotoThumbGallery({
  urls,
  onRemove,
  disabled = false,
  className,
}: ItcPhotoThumbGalleryProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  if (urls.length === 0) return null;

  return (
    <>
      <div className={cn("flex flex-wrap gap-2", className)}>
        {urls.map((url) => (
          <div key={url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setPreviewUrl(url)}
              className="block h-full w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Inspection photo" className="h-full w-full object-cover" />
            </button>
            {onRemove ? (
              <button
                type="button"
                disabled={disabled}
                aria-label="Remove photo"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(url);
                }}
                className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/80 p-0.5 text-white hover:bg-red-600 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {previewUrl ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setPreviewUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Inspection photo preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
