"use client";

import { useMemo, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent, type WheelEvent } from "react";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import ItcPlanPinMarker from "@/components/itc/ItcPlanPinMarker";
import { getRelativeCanvasCoordinates } from "@/lib/itc-drawing-upload";
import { clampPlanZoom, ITC_PLAN_MAX_ZOOM, ITC_PLAN_MIN_ZOOM, ITC_PLAN_ZOOM_STEP } from "@/lib/itc-plan-zoom";
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
  const viewportRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const src = planPreview || planUrl;
  const pdf = isPlanPdf(src, mimeType);
  const interactive = dropEnabled || mode === "line";

  const orderedPins = useMemo(
    () => [...pins].sort((a, b) => a.number - b.number),
    [pins]
  );

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -ITC_PLAN_ZOOM_STEP : ITC_PLAN_ZOOM_STEP;
    setScale((current) => clampPlanZoom(current + delta));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-plan-pin]")) return;
    if (interactive) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current?.active) return;
    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragRef.current.moved = true;
    setOffset({
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

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

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]];
      if (!a || !b) return;
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      pinchRef.current = { distance, scale };
    }
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    if (!a || !b) return;
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const next = pinchRef.current.scale * (distance / Math.max(pinchRef.current.distance, 1));
    setScale(clampPlanZoom(next));
  };

  if (!src) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <div className="flex items-center justify-end gap-1 border-b border-slate-200 bg-white px-2 py-1.5">
        <button
          type="button"
          onClick={() => setScale((current) => clampPlanZoom(current - ITC_PLAN_ZOOM_STEP))}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3.5rem] text-center text-[11px] font-semibold text-slate-500">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale((current) => clampPlanZoom(current + ITC_PLAN_ZOOM_STEP))}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50"
          aria-label="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={viewportRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className={cn(
          "relative h-[min(70vh,640px)] overflow-hidden bg-slate-100",
          interactive ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        )}
      >
        <div
          className="absolute left-1/2 top-1/2 origin-center"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
          }}
        >
          <div ref={planRef} onClick={handleClick} className="relative inline-block">
            {pdf ? (
              <object
                data={src}
                type="application/pdf"
                className="pointer-events-none h-[min(70vh,640px)] w-[min(92vw,960px)]"
              >
                <p className="p-4 text-sm text-slate-500">PDF plan loaded. Markup is active on this canvas.</p>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="ITP plan drawing"
                className="pointer-events-none block h-auto max-w-[min(92vw,960px)] select-none"
                draggable={false}
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
                    strokeWidth="1.2"
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
                  strokeWidth="1.2"
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
                  r="0.7"
                  fill="#ef4444"
                />
              ))}
            </svg>
            {orderedPins.map((pin) => (
              <ItcPlanPinMarker
                key={pin.id}
                x={pin.x}
                y={pin.y}
                label={String(pin.marker ?? pin.number)}
                selected={pin.selected}
                onClick={onPinClick ? () => onPinClick(pin) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="border-t border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500">
        Scroll or pinch to zoom up to {ITC_PLAN_MAX_ZOOM}x ({ITC_PLAN_MIN_ZOOM}x–{ITC_PLAN_MAX_ZOOM}x). Drag to pan when zoomed.
      </p>
    </div>
  );
}
