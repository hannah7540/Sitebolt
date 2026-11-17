"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
} from "react";
import { Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import ItcPlanPinMarker from "@/components/itc/ItcPlanPinMarker";
import { getRelativeCanvasCoordinates } from "@/lib/itc-drawing-upload";
import {
  clampPlanZoom,
  ITC_PLAN_MAX_ZOOM,
  ITC_PLAN_MIN_ZOOM,
  ITC_PLAN_ZOOM_STEP,
} from "@/lib/itc-plan-zoom";
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
  className?: string;
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
  className,
}: ItpItcPlanCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    scale: number;
    offsetX: number;
    offsetY: number;
    midX: number;
    midY: number;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [planLoaded, setPlanLoaded] = useState(false);
  const src = planPreview || planUrl;
  const pdf = isPlanPdf(src, mimeType);
  const interactive = dropEnabled || mode === "line";

  scaleRef.current = scale;
  offsetRef.current = offset;

  const orderedPins = useMemo(
    () => [...pins].sort((a, b) => a.number - b.number),
    [pins]
  );

  useEffect(() => {
    setPlanLoaded(false);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    // PDF <object> load events are unreliable — clear the spinner after a short settle.
    if (!src) return;
    const timeout = window.setTimeout(() => setPlanLoaded(true), pdf ? 1200 : 8000);
    return () => window.clearTimeout(timeout);
  }, [src, pdf]);

  const zoomAtClientPoint = (clientX: number, clientY: number, nextScale: number) => {
    const viewport = viewportRef.current;
    const currentScale = scaleRef.current;
    const clamped = clampPlanZoom(nextScale);
    if (!viewport || clamped === currentScale) {
      setScale(clamped);
      scaleRef.current = clamped;
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const ratio = clamped / currentScale;
    const currentOffset = offsetRef.current;
    const nextOffset = {
      x: mx - centerX - (mx - centerX - currentOffset.x) * ratio,
      y: my - centerY - (my - centerY - currentOffset.y) * ratio,
    };

    scaleRef.current = clamped;
    offsetRef.current = nextOffset;
    setScale(clamped);
    setOffset(nextOffset);
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !src) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -ITC_PLAN_ZOOM_STEP : ITC_PLAN_ZOOM_STEP;
      zoomAtClientPoint(event.clientX, event.clientY, scaleRef.current + delta);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [src]);

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
    const nextOffset = {
      x: dragRef.current.originX + dx,
      y: dragRef.current.originY + dy,
    };
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive || !planRef.current || !src) return;
    if (dragRef.current?.moved) return;
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
    if (event.touches.length !== 2) return;
    const [a, b] = [event.touches[0], event.touches[1]];
    if (!a || !b) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    pinchRef.current = {
      distance,
      scale: scaleRef.current,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
      midX: (a.clientX + b.clientX) / 2 - rect.left,
      midY: (a.clientY + b.clientY) / 2 - rect.top,
    };
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0], event.touches[1]];
    if (!a || !b) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const next = clampPlanZoom(
      pinchRef.current.scale * (distance / Math.max(pinchRef.current.distance, 1))
    );
    // Recompute from the gesture start so successive frames do not compound.
    scaleRef.current = pinchRef.current.scale;
    offsetRef.current = {
      x: pinchRef.current.offsetX,
      y: pinchRef.current.offsetY,
    };
    zoomAtClientPoint(
      rect.left + pinchRef.current.midX,
      rect.top + pinchRef.current.midY,
      next
    );
  };

  const handleTouchEnd = () => {
    if (pinchRef.current) pinchRef.current = null;
  };

  const markPlanLoaded = () => setPlanLoaded(true);

  if (!src) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[320px] w-full items-center justify-center bg-slate-50 p-6 text-sm text-slate-500",
          className
        )}
      >
        {emptyHint}
      </div>
    );
  }

  return (
    <div className={cn("relative h-full min-h-[min(70vh,640px)] w-full", className)}>
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-lg bg-white/90 p-1 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            const viewport = viewportRef.current;
            if (!viewport) {
              setScale((current) => clampPlanZoom(current - ITC_PLAN_ZOOM_STEP));
              return;
            }
            const rect = viewport.getBoundingClientRect();
            zoomAtClientPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
              scaleRef.current - ITC_PLAN_ZOOM_STEP
            );
          }}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-[3.5rem] text-center text-[11px] font-semibold text-slate-500">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => {
            const viewport = viewportRef.current;
            if (!viewport) {
              setScale((current) => clampPlanZoom(current + ITC_PLAN_ZOOM_STEP));
              return;
            }
            const rect = viewport.getBoundingClientRect();
            zoomAtClientPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
              scaleRef.current + ITC_PLAN_ZOOM_STEP
            );
          }}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            scaleRef.current = 1;
            offsetRef.current = { x: 0, y: 0 };
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Reset zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className={cn(
          "relative h-full w-full touch-none select-none overflow-hidden bg-slate-100",
          interactive ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        )}
        style={{ userSelect: "none" }}
      >
        {!planLoaded ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-100/90">
            <div className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading plan…
            </div>
          </div>
        ) : null}

        <div
          className="absolute left-1/2 top-1/2 origin-center will-change-transform"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
          }}
        >
          <div ref={planRef} onClick={handleClick} className="relative inline-block select-none">
            {pdf ? (
              <object
                data={src}
                type="application/pdf"
                onLoad={markPlanLoaded}
                className="pointer-events-none block h-[min(70vh,640px)] w-[min(100%,1100px)] max-w-none select-none"
              >
                <p className="p-4 text-sm text-slate-500">
                  PDF plan loaded. Markup is active on this canvas.
                </p>
              </object>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="ITP plan drawing"
                decoding="async"
                loading="eager"
                onLoad={markPlanLoaded}
                onError={markPlanLoaded}
                className="pointer-events-none block h-auto w-auto max-h-[min(70vh,720px)] max-w-none select-none"
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

      <span className="sr-only">
        Scroll or pinch to zoom up to {ITC_PLAN_MAX_ZOOM}x ({ITC_PLAN_MIN_ZOOM}x–
        {ITC_PLAN_MAX_ZOOM}x). Drag to pan when zoomed.
      </span>
    </div>
  );
}
