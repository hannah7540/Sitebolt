"use client";

import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getWorkerDisplayName,
  getWorkerInitials,
  type WorkerNameFields,
} from "@/lib/worker-utils";

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-11 w-11 text-sm",
} as const;

interface WorkerProfileAvatarProps {
  photoUrl?: string | null;
  worker?: WorkerNameFields | null;
  displayName?: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
  ringClassName?: string;
  alt?: string;
}

export default function WorkerProfileAvatar({
  photoUrl,
  worker,
  displayName,
  size = "md",
  className,
  ringClassName,
  alt,
}: WorkerProfileAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedName =
    displayName ??
    (worker ? getWorkerDisplayName(worker, "Worker") : "Worker");
  const initials = worker
    ? getWorkerInitials(worker)
    : getWorkerInitials({ full_name: resolvedName });
  const showPhoto = Boolean(photoUrl?.trim()) && !imageFailed;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-orange-500 to-orange-600",
        SIZE_CLASSES[size],
        ringClassName,
        className
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!.trim()}
          alt={alt ?? resolvedName}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : initials && initials !== "?" ? (
        <span className="font-semibold text-white">{initials}</span>
      ) : (
        <User className={cn("text-white", size === "sm" ? "h-4 w-4" : "h-5 w-5")} />
      )}
    </div>
  );
}
