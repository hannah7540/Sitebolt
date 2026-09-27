"use client";

import { useMemo, useRef, type MouseEvent } from "react";
import { MapPin } from "lucide-react";
import { getRelativeCanvasCoordinates } from "@/lib/itc-drawing-upload";
import { isPlanPdf } from "@/components/itc/admin/itp-itc-admin-api";
import type { ServiceRunPoint } from "@/components/itc/admin/itp-itc-admin-numbering";
import { cn } from "@/lib/utils";

export interface PlanCanvasPin {
  id: string;
  x: number;
  y: number;
  number: number;
  marker?: string;
  label?: string | null;
  selected?: boolean;
}

export interface PlanCanvasServiceRun {
  id: string;
  points: ServiceRunPoint[];
}

interface ItpItcPlanCanvasProps {
  planUrl: string | null;
  planPreview?: string | null;
  mimeType?: string | null;
  pins: PlanCanvasPin[];
  dropEnabled?: boolean;
  emptyHint?: string;
  mode?: "pin" | "line";
  serviceRunPoints?: ServiceRunPoint[];
  serviceRuns?: PlanCanvasServiceRun[];
  onDrop?: (x: number, y: number) => void;
  onPinClick?: (pin: PlanCanvasPin) => void;
  onServiceRunChange?: (points: ServiceRunPoint[]) => void;
}

function pointsToSvg(points: ServiceRunPoint[]): string {
  return points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
}

export default function ItpItcPlanCanvas({
  planUrl,
  planPreview,
  mimeType,
  pins,
  dropEnabled = false,
  emptyHint = "Upload a plan drawing to drop pins.",
  mode = "pin",
  serviceRunPoints = [],
  serviceRuns = [],
  onDrop,
  onPinClick,
  onServiceRunChange,
}: ItpItcPlanCanvasProps) {
  const planRef = useRef<HTMLDivElement>(null);
  const src = planPreview || planUrl;
  const pdf = isPlanPdf(src, mimeType);
  const interactive = dropEnabled || mode === "line";

  const orderedPins = useMemo(
    () => [...pins].sort((a, b) => a.number - b.number),
    [pins]
  );

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive || !planRef.current || !src) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-plan-pin]")) return;
    const coords = getRelativeCanvasCoordinates(
      event.clientX,
      event.clientY,
      planRef.current
    );
    if (mode === "line") {
      onServiceRunChange?.([...serviceRunPoints, { x: coords.x, y: coords.y }]);
      return;
    }
    onDrop?.(coords.x, coords.y);
  };

  if (!src) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        {emptyHint}
      </div>
    );
  }

  return (
    <div
      ref={planRef}
      onClick={handleClick}
      className={cn(
        "relative min-h-[360px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100",
        interactive && "cursor-crosshair"
      )}
    >
      {pdf ? (
        <object
          data={src}
          type="application/pdf"
          className="pointer-events-none h-[min(70vh,720px)] w-full"
        >
          <p className="p-4 text-sm text-slate-500">PDF plan loaded. Markup is active on this canvas.</p>
        </object>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="ITP plan drawing"
          className="pointer-events-none block h-auto w-full select-none"
        />
      )}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 z-[5] h-full w-full"
      >
        {serviceRuns.map((run) =>
          run.points.length > 1 ? (
            <polyline
              key={run.id}
              points={pointsToSvg(run.points)}
              fill="none"
              stroke="#ef4444"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null
        )}
        {serviceRunPoints.length > 1 ? (
          <polyline
            points={pointsToSvg(serviceRunPoints)}
            fill="none"
            stroke="#ef4444"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {serviceRunPoints.map((point, index) => (
          <circle
            key={`draft-${index}`}
            cx={point.x * 100}
            cy={point.y * 100}
            r="1.1"
            fill="#ef4444"
          />
        ))}
      </svg>
      {orderedPins.map((pin) => (
        <button
          key={pin.id}
          type="button"
          data-plan-pin
          onClick={(event) => {
            event.stopPropagation();
            onPinClick?.(pin);
          }}
          style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
          className={cn(
            "absolute z-10 flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1.5 text-[11px] font-bold shadow-md ring-2 ring-white",
            pin.selected ? "bg-orange-600 text-white" : "bg-orange-500 text-white"
          )}
          title={pin.label || `Pin ${pin.marker ?? pin.number}`}
        >
          <span className="sr-only">{pin.label || `Pin ${pin.number}`}</span>
          {pin.marker ?? pin.number}
          <MapPin className="absolute -bottom-3 h-3 w-3 text-orange-600" />
        </button>
      ))}
    </div>
  );
}
