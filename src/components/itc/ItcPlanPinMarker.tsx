"use client";

import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface ItcPlanPinMarkerProps {
  x: number;
  y: number;
  label?: string | null;
  selected?: boolean;
  colorClass?: string;
  onClick?: () => void;
}

export default function ItcPlanPinMarker({
  x,
  y,
  label,
  selected = false,
  colorClass = "text-orange-500",
  onClick,
}: ItcPlanPinMarkerProps) {
  const left = `${x * 100}%`;
  const top = `${y * 100}%`;
  const title = label || "Dropped pin";
  const className = cn(
    "absolute z-20 -translate-x-1/2 -translate-y-full drop-shadow-[0_1px_1px_rgba(15,23,42,0.55)]",
    colorClass,
    selected && "text-orange-700",
    onClick ? "cursor-pointer" : "pointer-events-none"
  );

  const icon = (
    <>
      <MapPin className="h-4 w-4" fill="currentColor" strokeWidth={1.75} />
      {label ? (
        <span className="absolute left-1/2 top-[3px] -translate-x-1/2 text-[7px] font-bold leading-none text-white">
          {label}
        </span>
      ) : null}
      <span className="sr-only">{title}</span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-plan-pin
        data-itc-pin
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        style={{ left, top }}
        className={className}
      >
        {icon}
      </button>
    );
  }

  return (
    <span data-plan-pin data-itc-pin title={title} style={{ left, top }} className={className}>
      {icon}
    </span>
  );
}
