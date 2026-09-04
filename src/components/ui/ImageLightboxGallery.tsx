"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export interface LightboxImage {
  url: string;
  alt: string;
}

interface ImageLightboxGalleryProps {
  images: LightboxImage[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightboxGallery({
  images,
  initialIndex,
  onClose,
}: ImageLightboxGalleryProps) {
  const [index, setIndex] = useState(initialIndex);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const goPrevious = useCallback(() => {
    if (images.length <= 1) return;
    setIndex((current) => (current - 1 + images.length) % images.length);
  }, [images.length]);

  const goNext = useCallback(() => {
    if (images.length <= 1) return;
    setIndex((current) => (current + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        goPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        event.stopPropagation();
        goNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [goNext, goPrevious, onClose]);

  if (images.length === 0 || !mounted) return null;

  const current = images[index] ?? images[0]!;
  const overlay = (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Close gallery"
        className="absolute right-4 top-4 z-20 inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
      >
        <X className="h-7 w-7" />
      </button>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goPrevious();
            }}
            aria-label="Previous photo"
            className="absolute left-3 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg hover:bg-orange-500 hover:text-white sm:left-6 sm:h-16 sm:w-16"
          >
            <ChevronLeft className="h-10 w-10" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            aria-label="Next photo"
            className="absolute right-3 top-1/2 z-20 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg hover:bg-orange-500 hover:text-white sm:right-6 sm:h-16 sm:w-16"
          >
            <ChevronRight className="h-10 w-10" />
          </button>
        </>
      ) : null}

      <div
        className="flex max-h-[92vh] max-w-[96vw] flex-col items-center gap-4 px-16 sm:px-24"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt}
          className="max-h-[78vh] max-w-full object-contain"
        />
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="rounded-full bg-white/15 px-4 py-1 text-sm font-semibold text-white">
            {index + 1} of {images.length}
          </p>
          {current.alt ? (
            <p className="max-w-xl text-sm text-white/80">{current.alt}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
