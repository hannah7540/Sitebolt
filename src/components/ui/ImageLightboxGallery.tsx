"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, X } from "lucide-react";

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
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setIndex(initialIndex);
    setZoom(1);
  }, [initialIndex]);

  useEffect(() => {
    setZoom(1);
  }, [index]);

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
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))));
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrevious, onClose]);

  if (images.length === 0) return null;

  const current = images[index] ?? images[0]!;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="Photo gallery"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close gallery"
        className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 p-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))));
          }}
          aria-label="Zoom out"
          className="rounded-full p-2 text-white hover:bg-black/60"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setZoom((value) => (value > 1 ? 1 : 2));
          }}
          className="min-w-[3.5rem] px-2 text-center text-xs font-semibold text-white"
          aria-label="Toggle zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setZoom((value) => Math.min(3, Number((value + 0.25).toFixed(2))));
          }}
          aria-label="Zoom in"
          className="rounded-full p-2 text-white hover:bg-black/60"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      {images.length > 1 ? (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goPrevious();
            }}
            aria-label="Previous photo"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            aria-label="Next photo"
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      ) : null}

      <div
        className="flex max-h-[92vh] max-w-[96vw] flex-col items-center gap-3 overflow-auto px-14"
        onClick={(event) => event.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.alt}
          className="max-h-[82vh] max-w-full origin-center object-contain transition-transform duration-150"
          style={{ transform: `scale(${zoom})` }}
          onDoubleClick={() => setZoom((value) => (value > 1 ? 1 : 2))}
        />
        <p className="max-w-xl text-center text-sm text-white/90">
          {current.alt}
          {images.length > 1 ? (
            <span className="text-white/60">{` · ${index + 1} of ${images.length}`}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
