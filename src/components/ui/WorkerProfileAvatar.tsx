"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getWorkerDisplayName,
  getWorkerInitials,
  type WorkerNameFields,
} from "@/lib/worker-utils";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-20 w-20 text-xl",
} as const;

interface WorkerProfileAvatarProps {
  photoUrl?: string | null;
  worker?: WorkerNameFields | null;
  displayName?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  ringClassName?: string;
  alt?: string;
  /** When true (default), clicking a real photo opens a full-size lightbox. */
  enableLightbox?: boolean;
}

export default function WorkerProfileAvatar({
  photoUrl,
  worker,
  displayName,
  size = "md",
  className,
  ringClassName,
  alt,
  enableLightbox = true,
}: WorkerProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const resolvedName =
    displayName ??
    (worker ? getWorkerDisplayName(worker, "Worker") : "Worker");
  const initials = worker
    ? getWorkerInitials(worker)
    : getWorkerInitials({ full_name: resolvedName });
  const trimmedPhoto = photoUrl?.trim() || "";
  const showPhoto = Boolean(trimmedPhoto) && !imageFailed;
  const canOpenLightbox = enableLightbox && showPhoto;

  const avatarShell = (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-500 to-orange-600",
        SIZE_CLASSES[size],
        ringClassName,
        canOpenLightbox &&
          "cursor-pointer transition-transform hover:scale-105 hover:opacity-90",
        className
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmedPhoto}
          alt={alt ?? resolvedName}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initials && initials !== "?" ? (
        <span className="font-semibold text-white">{initials}</span>
      ) : (
        <User className={cn("text-white", size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-5 w-5")} />
      )}
    </div>
  );

  return (
    <>
      {canOpenLightbox ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setLightboxOpen(true);
          }}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
          aria-label={`View full-size photo of ${resolvedName}`}
        >
          {avatarShell}
        </button>
      ) : (
        avatarShell
      )}

      {lightboxOpen && showPhoto ? (
        <ImageLightboxGallery
          images={[{ url: trimmedPhoto, alt: resolvedName }]}
          initialIndex={0}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  );
}
